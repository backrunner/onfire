import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { productKnowledge } from "@/drizzle/schema";
import { ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import type { AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { embedKnowledge } from "@/services/ai/embedding";

const knowledgeTypeEnum = z.enum([
  "description",
  "faq",
  "feature",
  "policy",
  "troubleshooting",
]);

const updateKnowledgeSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  knowledgeType: knowledgeTypeEnum.optional(),
  reembed: z.boolean().optional(),
});

async function findAccessibleKnowledge(ctx: AuthedContext) {
  const knowledge = await ctx.db.query.productKnowledge.findFirst({
    where: eq(productKnowledge.id, ctx.params.id),
  });
  if (!knowledge) throw notFound();
  // Cross-tenant access yields 404
  await assertProductAccess(ctx, knowledge.productId);
  return knowledge;
}

export const GET = withAuth({ permission: "product.manage" }, async (_req: NextRequest, ctx) => {
  const knowledge = await findAccessibleKnowledge(ctx);
  return ok(knowledge);
});

export const PATCH = withAuth({ permission: "product.manage" }, async (req: NextRequest, ctx) => {
  const existing = await findAccessibleKnowledge(ctx);
  const body = await parseBody(req, updateKnowledgeSchema);

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.title) updates.title = body.title;
  if (body.content) updates.content = body.content;
  if (body.knowledgeType) updates.knowledgeType = body.knowledgeType;

  await ctx.db.update(productKnowledge).set(updates).where(eq(productKnowledge.id, existing.id));

  // Re-embed if content changed and requested
  if (body.reembed && (body.title || body.content)) {
    try {
      await embedKnowledge(ctx.db, existing.id);
    } catch (error) {
      console.error("Failed to re-embed knowledge:", error);
    }
  }

  return ok({ updated: true });
});

export const DELETE = withAuth({ permission: "product.manage" }, async (_req: NextRequest, ctx) => {
  const existing = await findAccessibleKnowledge(ctx);

  await ctx.db.delete(productKnowledge).where(eq(productKnowledge.id, existing.id));

  return ok({ deleted: true });
});
