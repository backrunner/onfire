import { NextRequest } from "next/server";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { productKeys } from "@/drizzle/schema";
import { ok, notFound, badRequest, conflict } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { rotateProductKeySecret } from "@/lib/auth/api-key";
import { productKeySnapshot } from "@/lib/api-keys/snapshot";

export const POST = withAuth({ permission: "product.settings" }, async (_req: NextRequest, ctx) => {
  const key = await ctx.db.query.productKeys.findFirst({
    where: eq(productKeys.id, ctx.params.id),
  });
  if (!key) throw notFound("Key not found");
  await assertProductAccess(ctx, key.productId);

  if (key.revoked || (key.expiresAt !== null && !(Date.parse(key.expiresAt) > Date.now()))) {
    throw badRequest("Cannot rotate a revoked key");
  }

  const rotated = await rotateProductKeySecret(key.id);

  const changed = await ctx.db
    .update(productKeys)
    .set({ secretHash: rotated.secretHash })
    .where(and(
      productKeySnapshot(key),
      or(isNull(productKeys.expiresAt), gt(productKeys.expiresAt, new Date().toISOString())),
    ))
    .returning({ id: productKeys.id });
  if (!changed.length) throw conflict("Key changed; reload before editing");

  // The plaintext credential is returned exactly once.
  const response = ok({
    id: key.id,
    apiKey: rotated.plaintext,
    rotatedAt: new Date().toISOString(),
    expiresAt: key.expiresAt,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
});
