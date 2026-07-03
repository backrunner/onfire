import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { products } from "@/drizzle/schema";
import { ok, badRequest } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { tenantCondition } from "@/lib/api/scope";

const slaMinutes = z.number().int().positive().optional();

const createProductSchema = z.object({
  name: z.string().min(1),
  tenantId: z.string().optional(),
  slaHighAccept: slaMinutes,
  slaHighReply: slaMinutes,
  slaMediumAccept: slaMinutes,
  slaMediumReply: slaMinutes,
  slaLowAccept: slaMinutes,
  slaLowReply: slaMinutes,
  autoCloseMinutes: z.number().int().positive().nullable().optional(),
});

export const GET = withAuth({ permission: "product.manage" }, async (_req: NextRequest, ctx) => {
  const productList = await ctx.db
    .select()
    .from(products)
    .where(tenantCondition(ctx, products.tenantId));
  return ok(productList);
});

export const POST = withAuth({ permission: "product.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createProductSchema);

  // SuperAdmin may create a product in any tenant; others only in their own.
  const tenantId = body.tenantId ?? ctx.user.tenantId;
  if (!ctx.isSuperAdmin && !ctx.tenantIds.includes(tenantId)) {
    throw badRequest("Invalid tenantId");
  }

  const id = crypto.randomUUID();

  await ctx.db.insert(products).values({
    id,
    tenantId,
    name: body.name,
    slaHighAccept: body.slaHighAccept,
    slaHighReply: body.slaHighReply,
    slaMediumAccept: body.slaMediumAccept,
    slaMediumReply: body.slaMediumReply,
    slaLowAccept: body.slaLowAccept,
    slaLowReply: body.slaLowReply,
    autoCloseMinutes: body.autoCloseMinutes,
  });

  const created = await ctx.db.query.products.findFirst({ where: eq(products.id, id) });
  return ok(created, 201);
});
