import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  categoryRoutes,
  customers,
  emailConfigs,
  emailTemplates,
  inboundEmails,
  notificationChannels,
  notificationLogs,
  outboundEmails,
  productDocuments,
  productIdentityConfigs,
  productKeys,
  productKnowledge,
  products,
  productTeams,
  teams,
  templates,
  tickets,
  userProducts,
} from "@/drizzle/schema";
import { badRequest, conflict, ok, notFound, forbidden } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess, assertTeamAccess } from "@/lib/api/scope";
import {
  REMOTE_IDENTITY_SECRET_PURPOSE,
  safeIdentityEndpoint,
} from "@/lib/auth/remote-identity";
import { getEnv } from "@/lib/db";
import { sealSecret } from "@/lib/secret-storage";
import { safeHttpUrl } from "@/lib/external-url";

const slaMinutes = z.number().int().positive().nullable().optional();
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

const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
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
  teamIds: z.array(z.string()).optional(),
});

async function loadAccessibleProduct(ctx: AuthedContext, id: string) {
  await assertProductAccess(ctx, id);
  const product = await ctx.db.query.products.findFirst({ where: eq(products.id, id) });
  if (!product) throw notFound("Product not found");
  return product;
}

export const GET = withAuth({ permission: "product.settings" }, async (_req: NextRequest, ctx) => {
  const product = await loadAccessibleProduct(ctx, ctx.params.id);

  const teamRows = await ctx.db
    .select({ teamId: productTeams.teamId })
    .from(productTeams)
    .where(eq(productTeams.productId, product.id));
  const identity = await ctx.db.query.productIdentityConfigs.findFirst({
    where: eq(productIdentityConfigs.productId, product.id),
  });

  return ok({
    ...product,
    teamIds: teamRows.map((r) => r.teamId),
    identityEnabled: identity?.enabled ?? false,
    identityEndpointUrl: identity?.endpointUrl ?? null,
    identitySecretConfigured: Boolean(identity?.authSecret),
  });
});

export const PATCH = withAuth({ permission: "product.settings" }, async (req: NextRequest, ctx) => {
  const product = await loadAccessibleProduct(ctx, ctx.params.id);
  const body = await parseBody(req, updateProductSchema);
  const teamIds = body.teamIds
    ? [...new Set(body.teamIds)]
    : undefined;
  const existingIdentity =
    await ctx.db.query.productIdentityConfigs.findFirst({
      where: eq(productIdentityConfigs.productId, product.id),
    });

  if (teamIds && teamIds.length > 0) {
    const accessibleTeams = await Promise.all(
      teamIds.map((teamId) => assertTeamAccess(ctx, teamId))
    );
    if (accessibleTeams.some((team) => team.tenantId !== product.tenantId)) {
      throw forbidden("Cannot associate teams outside your tenant");
    }
  }

  const productFields = {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.homepageUrl !== undefined && { homepageUrl: body.homepageUrl }),
    ...(body.portalReturnUrl !== undefined && {
      portalReturnUrl: body.portalReturnUrl,
    }),
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
  if (teamIds !== undefined) {
    statements.push(
      ctx.db.delete(productTeams).where(eq(productTeams.productId, product.id))
    );
    if (teamIds.length > 0) {
      statements.push(
        ctx.db
          .insert(productTeams)
          .values(teamIds.map((teamId) => ({ productId: product.id, teamId })))
      );
    }
  }
  if (
    body.identityEnabled !== undefined ||
    body.identityEndpointUrl !== undefined ||
    body.identityAuthSecret !== undefined
  ) {
    const enabled = body.identityEnabled ?? existingIdentity?.enabled ?? false;
    const endpointUrl =
      body.identityEndpointUrl !== undefined
        ? body.identityEndpointUrl
        : existingIdentity?.endpointUrl ?? null;
    const authSecret = body.identityAuthSecret
      ? await sealSecret(
          body.identityAuthSecret,
          getEnv().AUTH_SECRET,
          REMOTE_IDENTITY_SECRET_PURPOSE
        )
      : existingIdentity?.authSecret ?? null;
    if (enabled && (!endpointUrl || !authSecret)) {
      throw badRequest("Enabled remote identity requires an endpoint and secret");
    }
    const now = new Date().toISOString();
    statements.push(
      ctx.db
        .insert(productIdentityConfigs)
        .values({
          productId: product.id,
          enabled,
          endpointUrl,
          authSecret,
          createdAt: existingIdentity?.createdAt ?? now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: productIdentityConfigs.productId,
          set: { enabled, endpointUrl, authSecret, updatedAt: now },
        })
    );
  }
  if (statements.length > 0) {
    await ctx.db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  }

  const updated = await ctx.db.query.products.findFirst({
    where: eq(products.id, product.id),
  });
  const updatedIdentity =
    await ctx.db.query.productIdentityConfigs.findFirst({
      where: eq(productIdentityConfigs.productId, product.id),
    });
  return ok({
    ...updated,
    identityEnabled: updatedIdentity?.enabled ?? false,
    identityEndpointUrl: updatedIdentity?.endpointUrl ?? null,
    identitySecretConfigured: Boolean(updatedIdentity?.authSecret),
  });
});

export const DELETE = withAuth({ permission: "product.manage" }, async (_req: NextRequest, ctx) => {
  const product = await loadAccessibleProduct(ctx, ctx.params.id);

  const dependencies = await Promise.all([
    ctx.db.query.tickets.findFirst({ where: eq(tickets.productId, product.id) }),
    ctx.db.query.customers.findFirst({ where: eq(customers.productId, product.id) }),
    ctx.db.query.templates.findFirst({ where: eq(templates.productId, product.id) }),
    ctx.db.query.productKeys.findFirst({ where: eq(productKeys.productId, product.id) }),
    ctx.db.query.categoryRoutes.findFirst({ where: eq(categoryRoutes.productId, product.id) }),
    ctx.db.query.emailConfigs.findFirst({ where: eq(emailConfigs.productId, product.id) }),
    ctx.db.query.emailTemplates.findFirst({ where: eq(emailTemplates.productId, product.id) }),
    ctx.db.query.inboundEmails.findFirst({ where: eq(inboundEmails.productId, product.id) }),
    ctx.db.query.outboundEmails.findFirst({ where: eq(outboundEmails.productId, product.id) }),
    ctx.db.query.notificationChannels.findFirst({
      where: eq(notificationChannels.productId, product.id),
    }),
    ctx.db.query.notificationLogs.findFirst({
      where: eq(notificationLogs.productId, product.id),
    }),
    ctx.db.query.productKnowledge.findFirst({
      where: eq(productKnowledge.productId, product.id),
    }),
    ctx.db.query.productDocuments.findFirst({
      where: eq(productDocuments.productId, product.id),
    }),
  ]);
  if (dependencies.some(Boolean)) {
    throw conflict("Product still has tickets, customers, configuration, or history records");
  }

  await ctx.db.batch([
    ctx.db
      .delete(productIdentityConfigs)
      .where(eq(productIdentityConfigs.productId, product.id)),
    ctx.db.delete(productTeams).where(eq(productTeams.productId, product.id)),
    ctx.db.delete(userProducts).where(eq(userProducts.productId, product.id)),
    ctx.db.delete(products).where(eq(products.id, product.id)),
  ]);

  return ok({ deleted: true });
});
