import { NextResponse } from "next/server";
import { z } from "zod";
import { withPublic } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/rate-limit";
import { authenticateStalwart } from "@/services/email/stalwart";
import { readBodyBytes } from "@/lib/request-body";
import { ApiError } from "@/lib/api/response";

const eventSchema = z.object({
  id: z.string().max(512).optional(),
  createdAt: z.string().max(128),
  type: z.string().min(1).max(256),
  data: z.record(z.string(), z.unknown()).default({}),
});

const payloadSchema = z.object({
  events: z.array(eventSchema).min(1).max(500),
});

/**
 * Stalwart telemetry Webhooks endpoint. Telemetry events do not contain the
 * original MIME body, so they are acknowledged for observability only. The
 * DATA-stage MTA Hook remains the ticket-ingestion path.
 */
export const POST = withPublic(async (req, { db, params }) => {
  await enforceRateLimit(db, req, "webhook:stalwart-events", {
    limit: 120,
    windowSeconds: 60,
  });
  const rawBody = await readBodyBytes(req, 2 * 1024 * 1024);
  const config = await authenticateStalwart(db, req, params.productId, rawBody);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "Validation failed", z.flattenError(parsed.error));
  const payload = parsed.data;
  const eventCounts: Record<string, number> = {};
  let accepted = 0;
  for (const event of payload.events) {
    if (!/^(message-ingest|delivery|smtp)\.[a-z][a-z0-9-]*$/.test(event.type)) continue;
    eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    accepted++;
  }
  console.info(JSON.stringify({
    event: "stalwart_telemetry_webhook",
    productId: config.productId,
    eventCounts,
    accepted,
    total: payload.events.length,
  }));
  return NextResponse.json(
    { accepted, ignored: payload.events.length - accepted },
    { headers: { "Cache-Control": "no-store" } },
  );
});
