import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { productKeys } from "@/drizzle/schema";
import { ok, notFound, badRequest } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { rotateProductKeySecret } from "@/lib/auth/api-key";

export const POST = withAuth({ permission: "product.manage" }, async (_req: NextRequest, ctx) => {
  const key = await ctx.db.query.productKeys.findFirst({
    where: eq(productKeys.id, ctx.params.id),
  });
  if (!key) throw notFound("Key not found");
  await assertProductAccess(ctx, key.productId);

  if (key.revoked) {
    throw badRequest("Cannot rotate a revoked key");
  }

  const rotated = await rotateProductKeySecret(key.id);

  await ctx.db
    .update(productKeys)
    .set({ secretHash: rotated.secretHash })
    .where(eq(productKeys.id, key.id));

  // The plaintext credential is returned exactly once.
  return ok({
    id: key.id,
    apiKey: rotated.plaintext,
    rotatedAt: new Date().toISOString(),
  });
});
