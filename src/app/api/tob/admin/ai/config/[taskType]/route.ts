import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api/handler";
import { notFound, ok } from "@/lib/api/response";
import { AI_TASK_TYPES } from "@/lib/ai-config";
import {
  deleteTaskRouting,
  saveTaskRouting,
  taskRoutingUpdateSchema,
} from "../shared";

const taskTypeSchema = z.enum(AI_TASK_TYPES);

export const PATCH = withAuth(
  { permission: "ai.config" },
  async (req: NextRequest, ctx) => {
    const taskType = taskTypeSchema.safeParse(ctx.params.taskType);
    if (!taskType.success) throw notFound();
    const body = await parseBody(req, taskRoutingUpdateSchema);
    await saveTaskRouting(
      ctx.db,
      taskType.data,
      body.enabled,
      body.assignments
    );
    return ok({ saved: true });
  }
);

export const DELETE = withAuth(
  { permission: "ai.config" },
  async (_req: NextRequest, ctx) => {
    const taskType = taskTypeSchema.safeParse(ctx.params.taskType);
    if (!taskType.success) throw notFound();
    await deleteTaskRouting(ctx.db, taskType.data);
    return ok({ deleted: true });
  }
);
