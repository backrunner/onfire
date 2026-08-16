import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api/handler";
import { notFound, ok } from "@/lib/api/response";
import { AI_TASK_TYPES } from "@/lib/ai-config";
import { assertCanManageAiScope } from "@/lib/ai-scope";
import { parseFilledAiScope } from "../../scope-query";
import {
  deleteTaskRouting,
  saveTaskRouting,
  taskRoutingUpdateSchema,
} from "../shared";

const taskTypeSchema = z.enum(AI_TASK_TYPES);

export const PATCH = withAuth({}, async (req: NextRequest, ctx) => {
    const taskType = taskTypeSchema.safeParse(ctx.params.taskType);
    if (!taskType.success) throw notFound();
    const ref = await parseFilledAiScope(req, ctx.db);
    await assertCanManageAiScope(ctx, ref);
    const body = await parseBody(req, taskRoutingUpdateSchema);
    await saveTaskRouting(
      ctx.db,
      taskType.data,
      body.enabled,
      body.assignments,
      ref,
      body.inherit ?? false
    );
    return ok({ saved: true });
  }
);

export const DELETE = withAuth({}, async (req: NextRequest, ctx) => {
    const taskType = taskTypeSchema.safeParse(ctx.params.taskType);
    if (!taskType.success) throw notFound();
    const ref = await parseFilledAiScope(req, ctx.db);
    await assertCanManageAiScope(ctx, ref);
    await deleteTaskRouting(ctx.db, taskType.data, ref);
    return ok({ deleted: true });
  }
);
