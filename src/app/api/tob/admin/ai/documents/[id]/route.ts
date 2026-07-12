import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { productDocuments } from "@/drizzle/schema";
import { ok, notFound, badRequest, ApiError } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import type { AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { getEnv } from "@/lib/db";
import { deleteEmbeddings } from "@/services/ai/embedding";

const actionSchema = z.object({
  action: z.string().min(1),
});

async function findAccessibleDocument(ctx: AuthedContext) {
  const document = await ctx.db.query.productDocuments.findFirst({
    where: eq(productDocuments.id, ctx.params.id),
  });
  if (!document) throw notFound();
  // Cross-tenant access yields 404
  await assertProductAccess(ctx, document.productId);
  return document;
}

export const GET = withAuth({ permission: "ai.knowledge" }, async (_req: NextRequest, ctx) => {
  const document = await findAccessibleDocument(ctx);
  return ok(document);
});

export const DELETE = withAuth({ permission: "ai.knowledge" }, async (_req: NextRequest, ctx) => {
  const existing = await findAccessibleDocument(ctx);

  try {
    await deleteEmbeddings(existing.vectorizeIds);
  } catch (error) {
    console.error("Failed to delete document vectors:", error);
  }
  await getEnv().R2.delete(existing.r2Key);
  await ctx.db.delete(productDocuments).where(eq(productDocuments.id, existing.id));

  return ok({ deleted: true });
});

export const POST = withAuth({ permission: "ai.knowledge" }, async (req: NextRequest, ctx) => {
  await findAccessibleDocument(ctx);
  const body = await parseBody(req, actionSchema);

  if (body.action === "reprocess") {
    throw new ApiError(
      501,
      "Automatic document extraction and indexing is not available yet"
    );
  }

  throw badRequest("Unknown action");
});
