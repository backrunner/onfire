import { z } from "zod";

export const MAX_INBOUND_BYTES = 10 * 1024 * 1024;
export const inboundQueueMessage = z.object({
  version: z.literal(1),
  kind: z.literal("inbound"),
  key: z.string().regex(/^inbound\/[a-f0-9]{64}\.eml$/),
}).strict();
export const outboundQueueMessage = z.object({
  version: z.literal(1),
  kind: z.literal("outbound"),
  id: z.string().min(1).max(128),
}).strict();
export type InboundQueueMessage = z.infer<typeof inboundQueueMessage>;
export type OutboundQueueMessage = z.infer<typeof outboundQueueMessage>;

export function emailAddressAllowed(address: string, allowed: string | undefined): boolean {
  return (allowed ?? "").split(",").some((value) =>
    value.trim().toLowerCase() === address.trim().toLowerCase() && value.trim() !== "",
  );
}

/** Persist the SMTP envelope separately from untrusted MIME display headers. */
export async function enqueueInboundEmail(
  message: ForwardableEmailMessage,
  storage: R2Bucket,
  queue: Queue<InboundQueueMessage>,
  source: "main" | "agent",
  allowedAddresses?: string,
): Promise<void> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.from) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) {
    message.setReject("A valid sender and recipient are required");
    return;
  }
  if (source === "agent" && !emailAddressAllowed(message.to, allowedAddresses)) {
    message.setReject("Recipient is not configured on this mail agent");
    return;
  }
  if (message.rawSize > MAX_INBOUND_BYTES) {
    message.setReject("Message exceeds the 10 MiB inbound limit");
    return;
  }
  const bytes = await new Response(message.raw).arrayBuffer();
  if (bytes.byteLength > MAX_INBOUND_BYTES) {
    message.setReject("Message exceeds the 10 MiB inbound limit");
    return;
  }
  const envelope = new TextEncoder().encode(`${message.from.toLowerCase()}\0${message.to.toLowerCase()}\0`);
  const hashInput = new Uint8Array(envelope.length + bytes.byteLength);
  hashInput.set(envelope);
  hashInput.set(new Uint8Array(bytes), envelope.length);
  const digest = await crypto.subtle.digest("SHA-256", hashInput);
  const key = `inbound/${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}.eml`;
  const job: InboundQueueMessage = { version: 1, kind: "inbound", key };
  const pendingKey = `pending/${key.slice(8, -4)}.json`;
  await storage.put(pendingKey, JSON.stringify(job));
  await storage.put(key, bytes, {
    httpMetadata: { contentType: "message/rfc822" },
    customMetadata: {
      source,
      from: message.from,
      to: message.to,
      authenticationResults: (message.headers.get("authentication-results") ?? "").slice(0, 4096),
    },
  });
  // Await enqueue. A storage/queue outage must not be acknowledged as success.
  await queue.send(job);
  await storage.delete(pendingKey).catch(error => console.error("Inbound marker cleanup deferred:", error));
}

/** Recover a successfully stored email whose enqueue was interrupted. */
export async function repairInboundEnqueue(storage: R2Bucket, queue: Queue<InboundQueueMessage>): Promise<void> {
  const pending = await storage.list({ prefix: "pending/", limit: 50 });
  for (const object of pending.objects) {
    if (Date.now() - object.uploaded.getTime() < 60_000) continue;
    const marker = await storage.get(object.key);
    if (!marker) continue;
    const job = inboundQueueMessage.parse(await marker.json());
    if (!await storage.head(job.key)) continue;
    await queue.send(job);
    await storage.delete(object.key);
  }
}

export function queueRetryDelay(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.min(attempts - 1, 7));
}
