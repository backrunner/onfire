import { NextResponse } from "next/server";
import { withPublic, parseBody } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  authenticateStalwart,
  MAX_STALWART_REQUEST_BYTES,
  normalizeStalwartHook,
  processStalwartEmail,
  stalwartHookSchema,
} from "@/services/email/stalwart";

export const POST = withPublic(async (req, { db, params }) => {
  await enforceRateLimit(db, req, "webhook:stalwart-hook", { limit: 120, windowSeconds: 60 });
  const config = await authenticateStalwart(db, req, params.productId);
  const hook = await parseBody(req, stalwartHookSchema, MAX_STALWART_REQUEST_BYTES);
  const payload = await normalizeStalwartHook(hook, config.inboundAddress!);
  if (payload) await processStalwartEmail(db, config.productId, payload);
  // Keep normal mailbox delivery. Quarantine is handled in OnFire, so it must
  // not discard/reject the entire SMTP transaction (which can have other RCPTs).
  return NextResponse.json({ action: "accept" }, { headers: { "Cache-Control": "no-store" } });
});
