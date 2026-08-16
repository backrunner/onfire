import { eq } from "drizzle-orm";
import { products } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import type { AuthedContext } from "@/lib/api/handler";
import { forbidden } from "@/lib/api/response";
import { Role } from "@/lib/types";
import { assertProductAccess } from "@/lib/api/scope";

export const AI_SCOPES = ["system", "tenant", "product"] as const;
export type AIScope = (typeof AI_SCOPES)[number];

export interface AIScopeRef {
  scope: AIScope;
  tenantId?: string | null;
  productId?: string | null;
}

export interface AIRuntimeContext {
  tenantId?: string | null;
  productId?: string | null;
}

export function aiScopeKey(ref: AIScopeRef): string {
  if (ref.scope === "product") {
    if (!ref.productId) throw new Error("Product scope requires a productId");
    return `product:${ref.productId}`;
  }
  if (ref.scope === "tenant") {
    if (!ref.tenantId) throw new Error("Tenant scope requires a tenantId");
    return `tenant:${ref.tenantId}`;
  }
  return "system";
}

export function parseAiScopeKey(scopeKey: string): AIScopeRef {
  if (scopeKey === "system") return { scope: "system" };
  if (scopeKey.startsWith("tenant:")) {
    return { scope: "tenant", tenantId: scopeKey.slice("tenant:".length) };
  }
  if (scopeKey.startsWith("product:")) {
    return { scope: "product", productId: scopeKey.slice("product:".length) };
  }
  return { scope: "system" };
}

export async function resolveAiScopeChain(
  db: Database,
  context: AIRuntimeContext
): Promise<string[]> {
  if (context.productId) {
    const product = await db.query.products.findFirst({
      where: eq(products.id, context.productId),
    });
    const tenantId = product?.tenantId ?? context.tenantId ?? null;
    return tenantId
      ? [`product:${context.productId}`, `tenant:${tenantId}`, "system"]
      : [`product:${context.productId}`, "system"];
  }
  if (context.tenantId) return [`tenant:${context.tenantId}`, "system"];
  return ["system"];
}

export async function fillAiScopeRef(
  db: Database,
  ref: AIScopeRef
): Promise<AIScopeRef> {
  if (ref.scope === "product" && ref.productId && !ref.tenantId) {
    const product = await db.query.products.findFirst({
      where: eq(products.id, ref.productId),
    });
    return { ...ref, tenantId: product?.tenantId ?? null };
  }
  return ref;
}

export function usageDailyBucketKey(input: {
  day: string;
  dimension: AIScope;
  tenantId?: string | null;
  productId?: string | null;
  credentialId: string;
  taskType: string;
}): string {
  return [
    input.day,
    input.dimension,
    input.tenantId ?? "",
    input.productId ?? "",
    input.credentialId,
    input.taskType,
  ].join("|");
}

export async function assertCanManageAiScope(
  ctx: AuthedContext,
  ref: AIScopeRef
): Promise<void> {
  if (ref.scope === "system") {
    if (!ctx.isSuperAdmin) throw forbidden("System AI settings are SuperAdmin-only");
    return;
  }
  if (ref.scope === "tenant") {
    const tenantId = ref.tenantId;
    if (!tenantId) throw forbidden("Tenant is required");
    if (ctx.isSuperAdmin) return;
    if (ctx.role === Role.TenantAdmin && ctx.tenantIds.includes(tenantId)) return;
    throw forbidden("Tenant AI settings are outside your scope");
  }
  const productId = ref.productId;
  if (!productId) throw forbidden("Product is required");
  await assertProductAccess(ctx, productId);
  if (
    ctx.isSuperAdmin ||
    ctx.role === Role.TenantAdmin ||
    ctx.role === Role.ProductAdmin
  ) {
    return;
  }
  throw forbidden("Product AI settings are outside your scope");
}

export async function assertCanViewAiUsage(
  ctx: AuthedContext,
  dimension: AIScope,
  tenantId?: string | null,
  productId?: string | null
): Promise<void> {
  if (dimension === "system") {
    if (!ctx.isSuperAdmin) throw forbidden("System usage is SuperAdmin-only");
    return;
  }
  if (dimension === "tenant") {
    if (!tenantId) throw forbidden("Tenant is required");
    if (ctx.isSuperAdmin) return;
    if (ctx.tenantIds.includes(tenantId)) return;
    throw forbidden("Tenant usage is outside your scope");
  }
  if (!productId) throw forbidden("Product is required");
  await assertProductAccess(ctx, productId);
}
