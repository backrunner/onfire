import { NextRequest } from "next/server";
import { getEnv } from "@/lib/db";
import { ok, err } from "@/lib/api/response";
import { withPublic } from "@/lib/api/handler";
import { timingSafeEqual } from "@/lib/crypto";
import { runScheduledScan } from "@/services/sla-scan";

/**
 * POST /api/toc/tasks/sla-scan — internal maintenance endpoint.
 *
 * Invoked by the worker's cron trigger through the WORKER_SELF_REFERENCE
 * service binding, authenticated with the deployment's AUTH_SECRET. It can
 * also be called manually by an operator holding the secret.
 */
export const POST = withPublic(async (req: NextRequest, { db }) => {
  const env = getEnv();
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.AUTH_SECRET}`;
  if (!env.AUTH_SECRET || !timingSafeEqual(authHeader, expected)) {
    return err("Unauthorized", 401);
  }

  const report = await runScheduledScan(db);
  return ok(report);
});
