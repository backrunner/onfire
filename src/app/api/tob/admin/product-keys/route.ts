import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { productKeys, products } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { assertProductAccess, productScopeCondition } from "@/lib/api/scope";
import { generateProductKeySecret } from "@/lib/auth/api-key";

const listQuerySchema = z.object({
  productId: z.string().optional(),
});

const createKeySchema = z.object({
  productId: z.string().min(1),
  name: z.string().max(100).optional(),
});

/** Public projection of a key row — the hash never leaves the server. */
function toKeyView(row: typeof productKeys.$inferSelect) {
  return {
    id: row.id,
    productId: row.productId,
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revoked: row.revoked,
  };
}

export const GET = withAuth({ permission: "product.settings" }, async (req: NextRequest, ctx) => {
  const { productId } = parseQuery(req, listQuerySchema);

  if (productId) {
    await assertProductAccess(ctx, productId);
    const keys = await ctx.db
      .select()
      .from(productKeys)
      .where(eq(productKeys.productId, productId));
    return ok(keys.map(toKeyView));
  }

  const accessible = await ctx.db
    .select({ id: products.id })
    .from(products)
    .where(productScopeCondition(ctx));
  const productIds = accessible.map((p) => p.id);
  if (productIds.length === 0) return ok([]);

  const keys = await ctx.db
    .select()
    .from(productKeys)
    .where(inArray(productKeys.productId, productIds));
  return ok(keys.map(toKeyView));
});

export const POST = withAuth({ permission: "product.settings" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createKeySchema);
  await assertProductAccess(ctx, body.productId);

  const generated = await generateProductKeySecret();
  const now = new Date().toISOString();

  await ctx.db.insert(productKeys).values({
    id: generated.id,
    productId: body.productId,
    name: body.name,
    secretHash: generated.secretHash,
    createdAt: now,
  });

  // The plaintext credential is returned exactly once.
  const response = ok(
    {
      id: generated.id,
      productId: body.productId,
      name: body.name,
      apiKey: generated.plaintext,
      createdAt: now,
    },
    201
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
});
