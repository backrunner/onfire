import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { emailTemplates } from "@/drizzle/schema";
import { ok, notFound, badRequest } from "@/lib/api/response";
import { withAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";

const TEMPLATE_TYPES = [
  "ticket_created",
  "ticket_replied",
  "ticket_closed",
  "ticket_escalated",
] as const;

const querySchema = z.object({
  productId: z.string().min(1),
});

const createSchema = z.object({
  productId: z.string().min(1),
  templateType: z.enum(TEMPLATE_TYPES),
  subjectTemplate: z.string().min(1).max(998),
  bodyTemplate: z.string().min(1).max(100_000),
  enabled: z.boolean().optional(),
});

export const GET = withAuth({ permission: "template.read" }, async (req: NextRequest, ctx) => {
  const { productId } = parseQuery(req, querySchema);
  await assertProductAccess(ctx, productId);

  const rows = await ctx.db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.productId, productId));
  return ok(rows);
});

export const POST = withAuth({ permission: "template.write" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createSchema);
  await assertProductAccess(ctx, body.productId);

  // Unique (productId, templateType) — guide the caller to PATCH instead
  const productTemplates = await ctx.db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.productId, body.productId));
  if (productTemplates.some((t) => t.templateType === body.templateType)) {
    throw badRequest(
      `A "${body.templateType}" template already exists for this product`
    );
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await ctx.db.insert(emailTemplates).values({
    id,
    productId: body.productId,
    templateType: body.templateType,
    subjectTemplate: body.subjectTemplate,
    bodyTemplate: body.bodyTemplate,
    enabled: body.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  });

  const created = await ctx.db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.id, id),
  });
  if (!created) throw notFound("Template not found after creation");
  return ok(created, 201);
});
