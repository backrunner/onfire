import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { assertCanManageAiScope } from "@/lib/ai-scope";
import { parseFilledAiScope } from "../../scope-query";
import { getUsageSettings, saveUsageSettings } from "@/services/ai/usage";

const updateSchema = z.object({
  inherit: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
});

export const GET = withAuth({}, async (req: NextRequest, ctx) => {
  const ref = await parseFilledAiScope(req, ctx.db);
  await assertCanManageAiScope(ctx, ref);
  return ok(await getUsageSettings(ctx.db, ref));
});

export const PATCH = withAuth({}, async (req: NextRequest, ctx) => {
  const ref = await parseFilledAiScope(req, ctx.db);
  await assertCanManageAiScope(ctx, ref);
  const body = await parseBody(req, updateSchema);
  await saveUsageSettings(ctx.db, ref, body);
  return ok({ updated: true });
});
