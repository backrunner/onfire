import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { templates, type TemplateRow } from "@/drizzle/schema";
import { badRequest, ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { parseFormSchemaValue, validateFormSchema } from "@/lib/form-schema";

const updateTemplateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  categories: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  formSchema: z.unknown().optional(),
});

const parseJson = (val: string | null | undefined): unknown => {
  if (val === null || val === undefined) return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
};

// categories / formSchema are stored as JSON strings; expand them for clients.
function serializeTemplate(row: TemplateRow) {
  return {
    ...row,
    categories: parseJson(row.categories),
    formSchema: parseJson(row.formSchema),
  };
}

async function loadAccessibleTemplate(ctx: AuthedContext, id: string) {
  const template = await ctx.db.query.templates.findFirst({
    where: eq(templates.id, id),
  });
  if (!template) throw notFound("Template not found");
  await assertProductAccess(ctx, template.productId);
  return template;
}

export const GET = withAuth({ permission: "template.read" }, async (_req: NextRequest, ctx) => {
  const template = await loadAccessibleTemplate(ctx, ctx.params.id);
  return ok(serializeTemplate(template));
});

export const PATCH = withAuth({ permission: "template.write" }, async (req: NextRequest, ctx) => {
  const template = await loadAccessibleTemplate(ctx, ctx.params.id);
  const body = await parseBody(req, updateTemplateSchema);
  const formSchema =
    body.formSchema !== undefined
      ? parseFormSchemaValue(body.formSchema)
      : undefined;
  const schemaErrors = formSchema ? validateFormSchema(formSchema) : [];
  if (body.formSchema !== undefined && (!formSchema || schemaErrors.length > 0)) {
    throw badRequest("Invalid form schema", schemaErrors);
  }

  await ctx.db
    .update(templates)
    .set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.categories !== undefined && {
        categories: JSON.stringify([...new Set(body.categories)]),
      }),
      ...(formSchema !== undefined && { formSchema: JSON.stringify(formSchema) }),
    })
    .where(eq(templates.id, template.id));

  const updated = await ctx.db.query.templates.findFirst({
    where: eq(templates.id, template.id),
  });
  return ok(updated ? serializeTemplate(updated) : null);
});

export const DELETE = withAuth({ permission: "template.write" }, async (_req: NextRequest, ctx) => {
  const template = await loadAccessibleTemplate(ctx, ctx.params.id);
  await ctx.db.delete(templates).where(eq(templates.id, template.id));
  return ok({ deleted: true });
});
