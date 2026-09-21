import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { productKeys } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { notFound } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { validateKeyExpiry } from "@/lib/api-keys/auth";
import { badRequest, conflict } from "@/lib/api/response";
import { productKeySnapshot } from "@/lib/api-keys/snapshot";

const updateKeySchema = z.object({
  name: z.string().max(100).optional(),
  revoked: z.literal(true).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});

function toKeyView(row: typeof productKeys.$inferSelect) {
  return {
    id: row.id,
    productId: row.productId,
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
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
  if (!Object.keys(body).length) throw badRequest("No changes provided");
  const expiresAt = body.expiresAt === undefined ? undefined : validateKeyExpiry(body.expiresAt);
  if (expiresAt && key.expiresAt && Date.parse(expiresAt) > Date.parse(key.expiresAt)) {
    throw badRequest("Create a new key to extend its lifetime");
  }

  const [updated] = await ctx.db
    .update(productKeys)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.revoked !== undefined && { revoked: body.revoked }),
      ...(expiresAt !== undefined && { expiresAt }),
    })
    .where(productKeySnapshot(key))
    .returning();
  if (!updated) throw conflict("Key changed; reload before editing");
  return ok(toKeyView(updated));
});

export const DELETE = withAuth({ permission: "product.settings" }, async (_req: NextRequest, ctx) => {
  const key = await loadAccessibleKey(ctx, ctx.params.id);
  await ctx.db.delete(productKeys).where(eq(productKeys.id, key.id));
  return ok({ deleted: true });
});
