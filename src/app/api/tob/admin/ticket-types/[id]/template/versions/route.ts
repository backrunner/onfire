import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { products, ticketTemplates } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { badRequest, conflict, ok } from "@/lib/api/response";
import {
  parseFormSchema,
  parseFormSchemaValue,
  validateFormSchema,
  validateFormSchemaLanguages,
} from "@/lib/form-schema";
import { parseSupportedLanguages } from "@/lib/product-language";
import { loadAccessibleTicketType } from "@/app/api/tob/admin/ticket-types/shared";
import { createTemplateVersion, listTemplateVersions } from "@/services/ticket-templates";

const schema = z.object({
  formSchema: z.unknown(),
  changeNote: z.string().trim().max(500).nullable().optional(),
});

export const GET = withAuth({ permission: "ticket_template.read" }, async (_req, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  const template = await ctx.db.query.ticketTemplates.findFirst({
    where: eq(ticketTemplates.ticketTypeId, type.id),
  });
  if (!template) return ok([]);
  const versions = await listTemplateVersions(ctx.db, template.id);
  return ok(versions.map((version) => ({
    ...version,
    formSchema: parseFormSchema(version.formSchema),
    current: template.currentVersionId === version.id,
  })));
});

export const POST = withAuth({ permission: "ticket_template.write" }, async (req: NextRequest, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  if (type.archivedAt) throw badRequest("Archived ticket types cannot receive a template version");
  const body = await parseBody(req, schema);
  const formSchema = parseFormSchemaValue(body.formSchema);
  const errors = formSchema ? validateFormSchema(formSchema) : [];
  if (!formSchema || errors.length > 0) throw badRequest("Invalid form schema", errors);
  const product = await ctx.db.query.products.findFirst({
    where: eq(products.id, type.productId),
  });
  const unsupportedLangs = validateFormSchemaLanguages(
    formSchema,
    parseSupportedLanguages(product?.supportedLanguages),
    product?.defaultLanguage
  );
  if (unsupportedLangs.length > 0) {
    throw badRequest("Form schema contains unsupported languages", unsupportedLangs);
  }
  try {
    return ok(
      await createTemplateVersion(ctx.db, {
        ticketTypeId: type.id,
        formSchema,
        changeNote: body.changeNote,
        actorId: ctx.user.id,
      }),
      201
    );
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw conflict("Another template version was saved concurrently; reload and try again");
    }
    if (error instanceof Error && error.message.includes("archived")) {
      throw badRequest(error.message);
    }
    throw error;
  }
});
