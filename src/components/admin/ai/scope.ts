import { qs } from "@/lib/api/client";
import type { AIScope } from "@/lib/ai-scope";

export function aiScopeQuery(input: {
  scope?: AIScope;
  tenantId?: string;
  productId?: string;
  includeInherited?: boolean;
}): string {
  return qs({
    scope: input.scope ?? "system",
    tenantId: input.tenantId,
    productId: input.productId,
    includeInherited: input.includeInherited ? "1" : undefined,
  });
}
