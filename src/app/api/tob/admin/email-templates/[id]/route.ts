import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { emailTemplates } from "@/drizzle/schema";
import { ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { emailTemplateMarkupIssues } from "@/lib/email-templates";

const updateSchema = z.object({
  subjectTemplate: z.string().min(1).max(998).optional(),
  bodyTemplate: z
    .string()
    .min(1)
    .max(100_000)
    .superRefine((value, refinement) => {
      for (const message of emailTemplateMarkupIssues(value)) {
        refinement.addIssue({ code: "custom", message });
      }
    })
    .optional(),
  enabled: z.boolean().optional(),
});

async function loadTemplate(ctx: AuthedContext, id: string) {
  const template = await ctx.db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.id, id),
  });
  if (!template) throw notFound("Email template not found");
  await assertProductAccess(ctx, template.productId);
  return template;
}

export const GET = withAuth({ permission: "template.read" }, async (_req: NextRequest, ctx) => {
  return ok(await loadTemplate(ctx, ctx.params.id));
});

export const PATCH = withAuth({ permission: "template.write" }, async (req: NextRequest, ctx) => {
  const template = await loadTemplate(ctx, ctx.params.id);
  const body = await parseBody(req, updateSchema);

  await ctx.db
    .update(emailTemplates)
    .set({
      ...(body.subjectTemplate !== undefined && { subjectTemplate: body.subjectTemplate }),
      ...(body.bodyTemplate !== undefined && { bodyTemplate: body.bodyTemplate }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(emailTemplates.id, template.id));

  const updated = await ctx.db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.id, template.id),
  });
  return ok(updated);
});

export const DELETE = withAuth({ permission: "template.write" }, async (_req: NextRequest, ctx) => {
  const template = await loadTemplate(ctx, ctx.params.id);
  await ctx.db.delete(emailTemplates).where(eq(emailTemplates.id, template.id));
  return ok({ deleted: true });
});
