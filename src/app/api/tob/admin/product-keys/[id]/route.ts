import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { productKeys } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { notFound } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";

const updateKeySchema = z.object({
  name: z.string().max(100).optional(),
  revoked: z.boolean().optional(),
});

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

async function loadAccessibleKey(ctx: AuthedContext, id: string) {
  const key = await ctx.db.query.productKeys.findFirst({
    where: eq(productKeys.id, id),
  });
  if (!key) throw notFound("Key not found");
  await assertProductAccess(ctx, key.productId);
  return key;
}

export const GET = withAuth({ permission: "product.settings" }, async (_req: NextRequest, ctx) => {
  const key = await loadAccessibleKey(ctx, ctx.params.id);
  return ok(toKeyView(key));
});

export const PATCH = withAuth({ permission: "product.settings" }, async (req: NextRequest, ctx) => {
  const key = await loadAccessibleKey(ctx, ctx.params.id);
  const body = await parseBody(req, updateKeySchema);

  await ctx.db
    .update(productKeys)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.revoked !== undefined && { revoked: body.revoked }),
    })
    .where(eq(productKeys.id, key.id));

  const updated = await ctx.db.query.productKeys.findFirst({
    where: eq(productKeys.id, key.id),
  });
  return ok(updated ? toKeyView(updated) : null);
});

export const DELETE = withAuth({ permission: "product.settings" }, async (_req: NextRequest, ctx) => {
  const key = await loadAccessibleKey(ctx, ctx.params.id);
  await ctx.db.delete(productKeys).where(eq(productKeys.id, key.id));
  return ok({ deleted: true });
});
