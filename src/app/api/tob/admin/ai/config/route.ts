import { NextRequest } from "next/server";
import { withAuth, parseBody } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import {
  listTaskRouting,
  saveTaskRouting,
  taskRoutingSchema,
} from "./shared";

export const GET = withAuth(
  { permission: "ai.config" },
  async (_req: NextRequest, ctx) => ok(await listTaskRouting(ctx.db))
);

export const POST = withAuth(
  { permission: "ai.config" },
  async (req: NextRequest, ctx) => {
    const body = await parseBody(req, taskRoutingSchema);
    await saveTaskRouting(ctx.db, body.taskType, body.enabled, body.assignments);
    return ok({ saved: true }, 201);
  }
);
