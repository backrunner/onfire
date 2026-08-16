import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { productKnowledge } from "@/drizzle/schema";
import { badRequest, ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import type { AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { hasConfiguredAITask } from "@/services/ai/config";
import { deleteEmbeddings, embedKnowledge } from "@/services/ai/embedding";

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

export const GET = withAuth({ permission: "ai.knowledge" }, async (_req: NextRequest, ctx) => {
  const knowledge = await findAccessibleKnowledge(ctx);
  return ok(knowledge);
});

export const PATCH = withAuth({ permission: "ai.knowledge" }, async (req: NextRequest, ctx) => {
  const existing = await findAccessibleKnowledge(ctx);
  const body = await parseBody(req, updateKnowledgeSchema);
  if (
    (body.title || body.content) &&
    !(await hasConfiguredAITask(ctx.db, "embedding", { productId: existing.productId }))
  ) {
    throw badRequest("Knowledge entries require a configured embedding credential");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.title) updates.title = body.title;
  if (body.content) updates.content = body.content;
  if (body.knowledgeType) updates.knowledgeType = body.knowledgeType;

  await ctx.db.update(productKnowledge).set(updates).where(eq(productKnowledge.id, existing.id));

  // Keep Vectorize synchronized whenever embedded content changes.
  if (body.title || body.content) {
    try {
      const embedded = await embedKnowledge(ctx.db, existing.id);
      if (!embedded && existing.vectorizeIds) {
        await deleteEmbeddings(existing.vectorizeIds);
        await ctx.db
          .update(productKnowledge)
          .set({ vectorizeIds: null, updatedAt: new Date().toISOString() })
          .where(eq(productKnowledge.id, existing.id));
      }
    } catch (error) {
      console.error("Failed to re-embed knowledge:", error);
      if (existing.vectorizeIds) {
        try {
          await deleteEmbeddings(existing.vectorizeIds);
          await ctx.db
            .update(productKnowledge)
            .set({ vectorizeIds: null, updatedAt: new Date().toISOString() })
            .where(eq(productKnowledge.id, existing.id));
        } catch (cleanupError) {
          console.error("Failed to clear stale knowledge vector:", cleanupError);
        }
      }
    }
  }

  return ok({ updated: true });
});

export const DELETE = withAuth({ permission: "ai.knowledge" }, async (_req: NextRequest, ctx) => {
  const existing = await findAccessibleKnowledge(ctx);

  try {
    await deleteEmbeddings(existing.vectorizeIds);
  } catch (error) {
    console.error("Failed to delete knowledge vectors:", error);
  }
  await ctx.db.delete(productKnowledge).where(eq(productKnowledge.id, existing.id));

  return ok({ deleted: true });
});
