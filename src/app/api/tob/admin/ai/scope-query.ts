import { z } from "zod";
import type { NextRequest } from "next/server";
import { parseQuery } from "@/lib/api/handler";
import {
  AI_SCOPES,
  type AIScopeRef,
  fillAiScopeRef,
} from "@/lib/ai-scope";
import type { Database } from "@/lib/db";

const scopeQuerySchema = z.object({
  scope: z.enum(AI_SCOPES).optional(),
  tenantId: z.string().optional(),
  productId: z.string().optional(),
});

export function parseAiScopeQuery(req: NextRequest): AIScopeRef {
  const query = parseQuery(req, scopeQuerySchema);
  const scope = query.scope ?? (query.productId ? "product" : query.tenantId ? "tenant" : "system");
  return {
    scope,
    tenantId: query.tenantId,
    productId: query.productId,
  };
}

export async function parseFilledAiScope(
  req: NextRequest,
  db: Database
): Promise<AIScopeRef> {
  return fillAiScopeRef(db, parseAiScopeQuery(req));
}
