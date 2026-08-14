import { eq } from "drizzle-orm";
import { productIdentityConfigs, products, productTeams } from "@/drizzle/schema";
import { badRequest, notFound } from "@/lib/api/response";
import { assertProductAccess, productScopeCondition } from "@/lib/api/scope";
import {
  requireMcpPermission,
  type McpGrantContext,
} from "@/lib/mcp/grants";

export interface McpProductSettingsUpdate {
  productId: string;
  name?: string;
  homepageUrl?: string | null;
  portalReturnUrl?: string | null;
  slaHighAccept?: number | null;
  slaHighReply?: number | null;
  slaMediumAccept?: number | null;
  slaMediumReply?: number | null;
  slaLowAccept?: number | null;
  slaLowReply?: number | null;
  autoCloseMinutes?: number | null;
}

export async function listMcpProducts(
  ctx: McpGrantContext,
): Promise<Record<string, unknown>> {
  requireMcpPermission(ctx, "settings:read");
  const rows = await ctx.db
    .select({
      id: products.id,
      tenantId: products.tenantId,
      name: products.name,
    })
    .from(products)
    .where(productScopeCondition(ctx))
    .orderBy(products.name);
  return { items: rows };
}

export async function getMcpProductSettings(
  ctx: McpGrantContext,
  productId: string,
): Promise<Record<string, unknown>> {
  requireMcpPermission(ctx, "settings:read");
  await assertProductAccess(ctx, productId);
  const product = await ctx.db.query.products.findFirst({
    where: eq(products.id, productId),
  });
  if (!product) throw notFound("Product not found");
  const [teamRows, identity] = await Promise.all([
    ctx.db
      .select({ teamId: productTeams.teamId })
      .from(productTeams)
      .where(eq(productTeams.productId, product.id)),
    ctx.db.query.productIdentityConfigs.findFirst({
      where: eq(productIdentityConfigs.productId, product.id),
    }),
  ]);

  return {
    product: {
      id: product.id,
      tenantId: product.tenantId,
      name: product.name,
      homepageUrl: product.homepageUrl,
      portalReturnUrl: product.portalReturnUrl,
      slaHighAccept: product.slaHighAccept,
      slaHighReply: product.slaHighReply,
      slaMediumAccept: product.slaMediumAccept,
      slaMediumReply: product.slaMediumReply,
      slaLowAccept: product.slaLowAccept,
      slaLowReply: product.slaLowReply,
      autoCloseMinutes: product.autoCloseMinutes,
      teamIds: teamRows.map((row) => row.teamId),
      identityEnabled: identity?.enabled ?? false,
      identitySecretConfigured: Boolean(identity?.authSecret),
    },
  };
}

export async function updateMcpProductSettings(
  ctx: McpGrantContext,
  input: McpProductSettingsUpdate,
): Promise<Record<string, unknown>> {
  requireMcpPermission(ctx, "settings:write");
  await assertProductAccess(ctx, input.productId);
  const fields: Partial<typeof products.$inferInsert> = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.homepageUrl !== undefined && { homepageUrl: input.homepageUrl }),
    ...(input.portalReturnUrl !== undefined && {
      portalReturnUrl: input.portalReturnUrl,
    }),
    ...(input.slaHighAccept !== undefined && {
      slaHighAccept: input.slaHighAccept,
    }),
    ...(input.slaHighReply !== undefined && {
      slaHighReply: input.slaHighReply,
    }),
    ...(input.slaMediumAccept !== undefined && {
      slaMediumAccept: input.slaMediumAccept,
    }),
    ...(input.slaMediumReply !== undefined && {
      slaMediumReply: input.slaMediumReply,
    }),
    ...(input.slaLowAccept !== undefined && {
      slaLowAccept: input.slaLowAccept,
    }),
    ...(input.slaLowReply !== undefined && {
      slaLowReply: input.slaLowReply,
    }),
    ...(input.autoCloseMinutes !== undefined && {
      autoCloseMinutes: input.autoCloseMinutes,
    }),
  };
  if (Object.keys(fields).length === 0) {
    throw badRequest("No product settings were provided");
  }

  await ctx.db
    .update(products)
    .set(fields)
    .where(eq(products.id, input.productId));
  return { productId: input.productId, updated: fields };
}
