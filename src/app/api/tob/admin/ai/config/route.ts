import { NextRequest } from "next/server";
import { withAuth, parseBody } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { assertCanManageAiScope } from "@/lib/ai-scope";
import { parseFilledAiScope } from "../scope-query";
import {
  listTaskRouting,
  saveTaskRouting,
  taskRoutingSchema,
} from "./shared";

export const GET = withAuth({}, async (req: NextRequest, ctx) => {
  const ref = await parseFilledAiScope(req, ctx.db);
  await assertCanManageAiScope(ctx, ref);
  return ok(await listTaskRouting(ctx.db, ref));
});

export const POST = withAuth({}, async (req: NextRequest, ctx) => {
  const ref = await parseFilledAiScope(req, ctx.db);
  await assertCanManageAiScope(ctx, ref);
  const body = await parseBody(req, taskRoutingSchema);
  await saveTaskRouting(
    ctx.db,
    body.taskType,
    body.enabled,
    body.assignments,
    ref,
    body.inherit ?? ref.scope !== "system"
  );
  return ok({ saved: true }, 201);
});
