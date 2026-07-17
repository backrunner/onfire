import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { productIdentityConfigs, products, tenants, ticketTypes } from "@/drizzle/schema";
import { ok, badRequest, notFound } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { productScopeCondition } from "@/lib/api/scope";
import {
  REMOTE_IDENTITY_SECRET_PURPOSE,
  safeIdentityEndpoint,
} from "@/lib/auth/remote-identity";
import { getEnv } from "@/lib/db";
import { sealSecret } from "@/lib/secret-storage";
import { safeHttpUrl } from "@/lib/external-url";

const slaMinutes = z.number().int().positive().optional();
const optionalHttpUrl = z
  .string()
  .url()
  .refine((value) => safeHttpUrl(value) !== null, "Only credential-free HTTP(S) URLs are allowed")
  .nullable()
  .optional();
const optionalIdentityUrl = z
  .string()
  .max(2048)
  .refine((value) => safeIdentityEndpoint(value) !== null, {
    message: "A public HTTPS URL on port 443 is required",
  })
  .nullable()
  .optional();

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tenantId: z.string().optional(),
  homepageUrl: optionalHttpUrl,
  portalReturnUrl: optionalHttpUrl,
  identityEnabled: z.boolean().optional(),
  identityEndpointUrl: optionalIdentityUrl,
  identityAuthSecret: z.string().min(16).max(2048).optional(),
  slaHighAccept: slaMinutes,
  slaHighReply: slaMinutes,
  slaMediumAccept: slaMinutes,
  slaMediumReply: slaMinutes,
  slaLowAccept: slaMinutes,
  slaLowReply: slaMinutes,
  autoCloseMinutes: z.number().int().positive().nullable().optional(),
});

export const GET = withAuth({ permission: "product.settings" }, async (_req: NextRequest, ctx) => {
  const productList = await ctx.db
    .select()
    .from(products)
    .where(productScopeCondition(ctx));
  if (productList.length === 0) return ok([]);
  const identityRows = await ctx.db
    .select()
    .from(productIdentityConfigs)
    .where(
      inArray(
        productIdentityConfigs.productId,
        productList.map((product) => product.id)
      )
    );
  const identityByProduct = new Map(
    identityRows.map((config) => [config.productId, config])
  );
  return ok(
    productList.map((product) => {
      const identity = identityByProduct.get(product.id);
      return {
        ...product,
        identityEnabled: identity?.enabled ?? false,
        identityEndpointUrl: identity?.endpointUrl ?? null,
        identitySecretConfigured: Boolean(identity?.authSecret),
      };
    })
  );
});

export const POST = withAuth({ permission: "product.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createProductSchema);

  // SuperAdmin may create a product in any tenant; others only in their own.
  const tenantId = body.tenantId ?? ctx.user.tenantId;
  if (!ctx.isSuperAdmin && !ctx.tenantIds.includes(tenantId)) {
    throw badRequest("Invalid tenantId");
  }
  const tenant = await ctx.db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant) throw notFound("Tenant not found");

  const id = crypto.randomUUID();
  if (
    body.identityEnabled &&
    (!body.identityEndpointUrl || !body.identityAuthSecret)
  ) {
    throw badRequest("Enabled remote identity requires an endpoint and secret");
  }
  const sealedIdentitySecret = body.identityAuthSecret
    ? await sealSecret(
        body.identityAuthSecret,
        getEnv().AUTH_SECRET,
        REMOTE_IDENTITY_SECRET_PURPOSE
      )
    : null;

  const productInsert = ctx.db.insert(products).values({
    id,
    tenantId,
    name: body.name,
    homepageUrl: body.homepageUrl ?? null,
    portalReturnUrl: body.portalReturnUrl ?? null,
    slaHighAccept: body.slaHighAccept,
    slaHighReply: body.slaHighReply,
    slaMediumAccept: body.slaMediumAccept,
    slaMediumReply: body.slaMediumReply,
    slaLowAccept: body.slaLowAccept,
    slaLowReply: body.slaLowReply,
    autoCloseMinutes: body.autoCloseMinutes,
  });

  const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
    productInsert,
  ];
  const now = new Date().toISOString();
  statements.push(
    ctx.db.insert(ticketTypes).values({
      id: crypto.randomUUID(),
      productId: id,
      level: 1,
      name: "Unclassified",
      description: "System fallback for messages that cannot be classified",
      sortOrder: -2147483648,
      systemKey: "unclassified",
      createdAt: now,
      updatedAt: now,
    })
  );
  if (
    body.identityEnabled !== undefined ||
    body.identityEndpointUrl !== undefined ||
    body.identityAuthSecret !== undefined
  ) {
    statements.push(
      ctx.db.insert(productIdentityConfigs).values({
        productId: id,
        enabled: body.identityEnabled ?? false,
        endpointUrl: body.identityEndpointUrl ?? null,
        authSecret: sealedIdentitySecret,
        createdAt: now,
        updatedAt: now,
      })
    );
  }
  await ctx.db.batch(statements);

  const created = await ctx.db.query.products.findFirst({ where: eq(products.id, id) });
  return ok(
    {
      ...created,
      identityEnabled: body.identityEnabled ?? false,
      identityEndpointUrl: body.identityEndpointUrl ?? null,
      identitySecretConfigured: Boolean(body.identityAuthSecret),
    },
    201
  );
});
