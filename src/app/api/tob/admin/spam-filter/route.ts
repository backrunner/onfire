import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { spamFilterConfigs, tenants } from "@/drizzle/schema";
import { parseBody, parseQuery, withAuth } from "@/lib/api/handler";
import { badRequest, forbidden, notFound, ok } from "@/lib/api/response";
import { safePublicHttpUrl } from "@/lib/external-url";
import { Role } from "@/lib/types";
import { sealSpamFilterSecret } from "@/services/email/spam-filter";

const querySchema = z.object({ tenantId: z.string().optional() });
const updateSchema = z.object({
  tenantId: z.string().optional(),
  mode: z.enum(["inherit", "disabled", "custom"]),
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
  if (body.mode === "custom" && !safePublicHttpUrl(body.endpointUrl)) {
    throw badRequest("A public HTTPS URL on port 443 is required");
  }
  const scopeKey = targetTenant ? `tenant:${targetTenant}` : "global";
  const existing = await ctx.db.query.spamFilterConfigs.findFirst({
    where: eq(spamFilterConfigs.scopeKey, scopeKey),
  });
  if (body.mode === "custom" && !body.authSecret && !existing?.authSecret) {
    throw badRequest("An authentication secret is required for a custom service");
  }
  const now = new Date().toISOString();
  const authSecret = body.authSecret
    ? await sealSpamFilterSecret(scopeKey, body.authSecret)
    : existing?.authSecret ?? null;
  await ctx.db
    .insert(spamFilterConfigs)
    .values({
      id: existing?.id ?? crypto.randomUUID(),
      scopeKey,
      scope: targetTenant ? "tenant" : "global",
      tenantId: targetTenant,
      mode: body.mode,
      endpointUrl: body.mode === "custom" ? body.endpointUrl : null,
      authSecret: body.mode === "custom" ? authSecret : null,
      timeoutMs: body.timeoutMs,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: spamFilterConfigs.scopeKey,
      set: {
        mode: body.mode,
        endpointUrl: body.mode === "custom" ? body.endpointUrl : null,
        authSecret: body.mode === "custom" ? authSecret : null,
        timeoutMs: body.timeoutMs,
        updatedAt: now,
      },
    });
  return ok({ updated: true });
});
