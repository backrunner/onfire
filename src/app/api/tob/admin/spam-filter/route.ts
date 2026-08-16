import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { spamFilterConfigs, tenants } from "@/drizzle/schema";
import { parseBody, parseQuery, withAuth } from "@/lib/api/handler";
import { badRequest, forbidden, notFound, ok } from "@/lib/api/response";
import { safePublicHttpUrl } from "@/lib/external-url";
import {
  SPAM_FILTER_PROVIDERS,
  normalizeSpamFilterProvider,
  spamFilterProviderDef,
} from "@/lib/spam-filter-providers";
import { Role } from "@/lib/types";
import { sealSpamFilterSecret } from "@/services/email/spam-filter";

const querySchema = z.object({ tenantId: z.string().optional() });
const updateSchema = z.object({
  tenantId: z.string().optional(),
  mode: z.enum(["inherit", "disabled", "custom"]),
  provider: z.enum(SPAM_FILTER_PROVIDERS).optional(),
  endpointUrl: z.string().max(2048).nullable().optional(),
  authSecret: z.string().max(2048).optional(),
  timeoutMs: z.number().int().min(500).max(10_000).default(3000),
});

export const GET = withAuth({ permission: "spam.config" }, async (req, ctx) => {
  const { tenantId } = parseQuery(req, querySchema);
  const targetTenant = tenantId ?? (ctx.role === Role.TenantAdmin ? ctx.user.tenantId : null);
  if (targetTenant && !ctx.isSuperAdmin && !ctx.tenantIds.includes(targetTenant)) {
    throw forbidden("Tenant is outside your scope");
  }
  if (!targetTenant && !ctx.isSuperAdmin) throw forbidden("Global spam settings are SuperAdmin-only");
  if (targetTenant) {
    const tenant = await ctx.db.query.tenants.findFirst({
      where: eq(tenants.id, targetTenant),
    });
    if (!tenant) throw notFound("Tenant not found");
  }
  const scopeKey = targetTenant ? `tenant:${targetTenant}` : "global";
  const row = await ctx.db.query.spamFilterConfigs.findFirst({
    where: eq(spamFilterConfigs.scopeKey, scopeKey),
  });
  return ok(
    row
      ? { ...row, authSecret: undefined, secretConfigured: Boolean(row.authSecret) }
      : {
          scopeKey,
          scope: targetTenant ? "tenant" : "global",
          tenantId: targetTenant,
          mode: targetTenant ? "inherit" : "disabled",
          provider: "custom",
          endpointUrl: null,
          timeoutMs: 3000,
          secretConfigured: false,
        }
  );
});

export const PATCH = withAuth({ permission: "spam.config" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, updateSchema);
  const targetTenant = body.tenantId ?? (ctx.role === Role.TenantAdmin ? ctx.user.tenantId : null);
  if (targetTenant && !ctx.isSuperAdmin && !ctx.tenantIds.includes(targetTenant)) {
    throw forbidden("Tenant is outside your scope");
  }
  if (!targetTenant && !ctx.isSuperAdmin) throw forbidden("Global spam settings are SuperAdmin-only");
  if (targetTenant) {
    const tenant = await ctx.db.query.tenants.findFirst({
      where: eq(tenants.id, targetTenant),
    });
    if (!tenant) throw notFound("Tenant not found");
  }
  if (!targetTenant && body.mode === "inherit") throw badRequest("Global settings cannot inherit");
  const provider =
    body.mode === "custom" ? normalizeSpamFilterProvider(body.provider) : "custom";
  const definition = spamFilterProviderDef(provider);
  if (
    body.mode === "custom" &&
    definition.requiresEndpoint &&
    !safePublicHttpUrl(body.endpointUrl)
  ) {
    throw badRequest(
      definition.endpointKind === "site"
        ? "A public HTTPS site URL on port 443 is required"
        : "A public HTTPS URL on port 443 is required"
    );
  }
  const scopeKey = targetTenant ? `tenant:${targetTenant}` : "global";
  const existing = await ctx.db.query.spamFilterConfigs.findFirst({
    where: eq(spamFilterConfigs.scopeKey, scopeKey),
  });
  if (
    body.mode === "custom" &&
    definition.requiresSecret &&
    !body.authSecret &&
    !existing?.authSecret
  ) {
    throw badRequest("An authentication secret is required for this service");
  }
  const now = new Date().toISOString();
  const storesSecret =
    body.mode === "custom" && (definition.requiresSecret || definition.secretOptional);
  const authSecret = storesSecret
    ? body.authSecret
      ? await sealSpamFilterSecret(scopeKey, body.authSecret)
      : existing?.authSecret ?? null
    : null;
  const endpointUrl =
    body.mode === "custom" && definition.requiresEndpoint ? body.endpointUrl : null;
  await ctx.db
    .insert(spamFilterConfigs)
    .values({
      id: existing?.id ?? crypto.randomUUID(),
      scopeKey,
      scope: targetTenant ? "tenant" : "global",
      tenantId: targetTenant,
      mode: body.mode,
      provider,
      endpointUrl,
      authSecret,
      timeoutMs: body.timeoutMs,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: spamFilterConfigs.scopeKey,
      set: {
        mode: body.mode,
        provider,
        endpointUrl,
        authSecret,
        timeoutMs: body.timeoutMs,
        updatedAt: now,
      },
    });
  return ok({ updated: true });
});
