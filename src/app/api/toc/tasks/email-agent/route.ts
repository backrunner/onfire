import { z } from "zod";
import { getEnv } from "@/lib/db";
import { withPublic, parseBody } from "@/lib/api/handler";
import { err, ok } from "@/lib/api/response";
import { timingSafeEqual } from "@/lib/crypto";
import { deliveryReceiptSchema } from "@/lib/email-agent-contract";
import { inboundQueueMessage } from "@/lib/email-queue";
import { claimOutbound, completeOutbound, repairEmailOutbox } from "@/services/email/agent-outbox";
import { processQueuedInbound } from "@/services/email/queued-inbound";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inbound"), message: inboundQueueMessage }).strict(),
  z.object({ action: z.literal("claim"), id: z.string().min(1).max(128) }).strict(),
  z.object({ action: z.literal("complete"), receipt: deliveryReceiptSchema }).strict(),
  z.object({ action: z.literal("repair") }).strict(),
]);

/** Only the main entrypoint knows AUTH_SECRET. Agent calls a restricted named RPC entrypoint. */
export const POST = withPublic(async (req, { db }) => {
  const env = getEnv();
  if (!env.AUTH_SECRET || !await timingSafeEqual(req.headers.get("authorization") ?? "", `Bearer ${env.AUTH_SECRET}`)) {
    return err("Unauthorized", 401);
  }
  const input = await parseBody(req, schema);
  switch (input.action) {
    case "inbound": return ok(await processQueuedInbound(db, input.message));
    case "claim": return ok(await claimOutbound(db, input.id));
    case "complete": await completeOutbound(db, input.receipt); return ok(null);
    case "repair": await repairEmailOutbox(db); return ok(null);
  }
});
