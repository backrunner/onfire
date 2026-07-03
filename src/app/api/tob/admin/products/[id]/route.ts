import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { products, productTeams, teams } from "@/drizzle/schema";
import { ok, notFound, forbidden } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { tenantCondition } from "@/lib/api/scope";

const slaMinutes = z.number().int().positive().nullable().optional();

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  slaHighAccept: slaMinutes,
  slaHighReply: slaMinutes,
  slaMediumAccept: slaMinutes,
  slaMediumReply: slaMinutes,
  slaLowAccept: slaMinutes,
  slaLowReply: slaMinutes,
  autoCloseMinutes: z.number().int().positive().nullable().optional(),
  teamIds: z.array(z.string()).optional(),
});

async function loadAccessibleProduct(ctx: AuthedContext, id: string) {
  const product = await ctx.db.query.products.findFirst({ where: eq(products.id, id) });
  // 404 for cross-tenant access to avoid leaking product existence.
  if (!product || (!ctx.isSuperAdmin && !ctx.tenantIds.includes(product.tenantId))) {
    throw notFound("Product not found");
  }
  return product;
}

export const GET = withAuth({ permission: "product.manage" }, async (_req: NextRequest, ctx) => {
  const product = await loadAccessibleProduct(ctx, ctx.params.id);

  const teamRows = await ctx.db
    .select({ teamId: productTeams.teamId })
    .from(productTeams)
    .where(eq(productTeams.productId, product.id));

  return ok({ ...product, teamIds: teamRows.map((r) => r.teamId) });
});

export const PATCH = withAuth({ permission: "product.manage" }, async (req: NextRequest, ctx) => {
  const product = await loadAccessibleProduct(ctx, ctx.params.id);
  const body = await parseBody(req, updateProductSchema);

  if (body.teamIds && body.teamIds.length > 0) {
    const accessibleTeams = await ctx.db
      .select({ id: teams.id })
      .from(teams)
      .where(tenantCondition(ctx, teams.tenantId));
    const accessibleTeamIds = new Set(accessibleTeams.map((t) => t.id));
    if (body.teamIds.some((teamId) => !accessibleTeamIds.has(teamId))) {
      throw forbidden("Cannot associate teams outside your tenant");
    }
  }

  const productFields = {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.slaHighAccept !== undefined && { slaHighAccept: body.slaHighAccept }),
    ...(body.slaHighReply !== undefined && { slaHighReply: body.slaHighReply }),
    ...(body.slaMediumAccept !== undefined && { slaMediumAccept: body.slaMediumAccept }),
    ...(body.slaMediumReply !== undefined && { slaMediumReply: body.slaMediumReply }),
    ...(body.slaLowAccept !== undefined && { slaLowAccept: body.slaLowAccept }),
    ...(body.slaLowReply !== undefined && { slaLowReply: body.slaLowReply }),
    ...(body.autoCloseMinutes !== undefined && { autoCloseMinutes: body.autoCloseMinutes }),
  };

  const statements: BatchItem<"sqlite">[] = [];
  if (Object.keys(productFields).length > 0) {
    statements.push(
      ctx.db.update(products).set(productFields).where(eq(products.id, product.id))
    );
  }
  if (body.teamIds !== undefined) {
    statements.push(
      ctx.db.delete(productTeams).where(eq(productTeams.productId, product.id))
    );
    if (body.teamIds.length > 0) {
      statements.push(
        ctx.db
          .insert(productTeams)
          .values(body.teamIds.map((teamId) => ({ productId: product.id, teamId })))
      );
    }
  }
  if (statements.length > 0) {
    await ctx.db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  }

  const updated = await ctx.db.query.products.findFirst({
    where: eq(products.id, product.id),
  });
  return ok(updated);
});

export const DELETE = withAuth({ permission: "product.manage" }, async (_req: NextRequest, ctx) => {
  const product = await loadAccessibleProduct(ctx, ctx.params.id);

  await ctx.db.batch([
    ctx.db.delete(productTeams).where(eq(productTeams.productId, product.id)),
    ctx.db.delete(products).where(eq(products.id, product.id)),
  ]);

  return ok({ deleted: true });
});
