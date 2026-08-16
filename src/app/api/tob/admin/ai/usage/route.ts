import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AI_SCOPES, assertCanViewAiUsage } from "@/lib/ai-scope";
import { listUsageDaily } from "@/services/ai/usage";

const querySchema = z.object({
  dimension: z.enum(AI_SCOPES).default("system"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tenantId: z.string().optional(),
  productId: z.string().optional(),
  credentialId: z.string().optional(),
});

export const GET = withAuth({}, async (req: NextRequest, ctx) => {
  const query = parseQuery(req, querySchema);
  await assertCanViewAiUsage(ctx, query.dimension, query.tenantId, query.productId);
  const items = await listUsageDaily(ctx.db, query);
  const totals = items.reduce(
    (acc, row) => ({
      promptTokens: acc.promptTokens + row.promptTokens,
      completionTokens: acc.completionTokens + row.completionTokens,
      totalTokens: acc.totalTokens + row.totalTokens,
      requestCount: acc.requestCount + row.requestCount,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 }
  );
  return ok({ items, totals });
});
