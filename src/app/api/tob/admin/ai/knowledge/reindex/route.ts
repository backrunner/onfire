import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { productKnowledge } from "@/drizzle/schema";
import { withAuth, parseQuery, parseBody } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { ok } from "@/lib/api/response";
import { knowledgeEmbeddingStatus } from "@/services/ai/embedding";

const schema = z.object({ productId: z.string().min(1).max(128) });

export const GET = withAuth({ permission: "ai.knowledge" }, async (req: NextRequest, ctx) => {
  const { productId } = parseQuery(req, schema);
  await assertProductAccess(ctx, productId);
  return ok(await knowledgeEmbeddingStatus(ctx.db, productId));
});

/** Explicit retry also supports replacing the bound index with the same dimensions. */
export const POST = withAuth({ permission: "ai.knowledge" }, async (req: NextRequest, ctx) => {
  const { productId } = await parseBody(req, schema);
  await assertProductAccess(ctx, productId);
  await ctx.db.update(productKnowledge).set({
    embeddingSourceUpdatedAt: null, embeddingAttemptedAt: null,
    embeddingLease: null, embeddingError: null,
  }).where(eq(productKnowledge.productId, productId));
  return ok({ queued: true }, 202);
});
