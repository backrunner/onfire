import { z } from "zod";

export type NotificationPolicyScope =
  | { scope: "tenant"; tenantId: string }
  | { scope: "team"; teamId: string }
  | { scope: "product"; productId: string };

export const notificationScopeFields = {
  scope: z.enum(["tenant", "team", "product"]).default("product"),
  tenantId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
};

export const notificationScopeQuerySchema = z.object({
  ...notificationScopeFields,
  contextTeamId: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  const required = value.scope === "tenant" ? "tenantId" : value.scope === "team" ? "teamId" : "productId";
  if (!value[required]) ctx.addIssue({ code: "custom", path: [required], message: `${required} is required` });
  for (const key of ["tenantId", "teamId", "productId"] as const) {
    if (key !== required && value[key]) ctx.addIssue({ code: "custom", path: [key], message: `Unexpected ${key} for ${value.scope} scope` });
  }
  if (value.contextTeamId && value.scope !== "product") ctx.addIssue({ code: "custom", path: ["contextTeamId"], message: "Team context is only valid for products" });
});

export interface PolicyOwnership {
  scope: "tenant" | "team" | "product";
  tenantId: string | null;
  teamId: string | null;
  productId: string | null;
  overridesId: string | null;
}

export function policyBelongsTo(row: PolicyOwnership, owner: NotificationPolicyScope) {
  return row.scope === owner.scope && (
    owner.scope === "tenant" ? row.tenantId === owner.tenantId :
    owner.scope === "team" ? row.teamId === owner.teamId : row.productId === owner.productId
  );
}

export function policyOwner(row: PolicyOwnership): NotificationPolicyScope {
  if (row.scope === "tenant" && row.tenantId) return { scope: "tenant", tenantId: row.tenantId };
  if (row.scope === "team" && row.teamId) return { scope: "team", teamId: row.teamId };
  if (row.scope === "product" && row.productId) return { scope: "product", productId: row.productId };
  throw new Error("Invalid notification policy ownership");
}
