import PostalMime from "postal-mime";
import { getEnv, type Database } from "@/lib/db";
import { emailAddressAllowed, MAX_INBOUND_BYTES, type InboundQueueMessage } from "@/lib/email-queue";
import { processInboundEmail } from "./inbound";
import { agentProduct } from "./agent-outbox";

export async function processQueuedInbound(db: Database, job: InboundQueueMessage) {
  const env = getEnv();
  const object = await env.EMAIL_STORAGE.get(job.key);
  if (!object) throw new Error("Queued email body is missing from R2");
  if (object.size > MAX_INBOUND_BYTES) throw new Error("Queued email exceeds the inbound limit");
  const metadata = object.customMetadata;
  if (!metadata?.from || !metadata.to || !["agent", "main"].includes(metadata.source)) {
    throw new Error("Queued email is missing its SMTP envelope");
  }
  if (metadata.source === "agent" && !emailAddressAllowed(metadata.to, env.EMAIL_AGENT_ADDRESSES)) {
    throw new Error("Queued recipient is not assigned to the mail agent");
  }
  const productId = agentProduct(metadata.to);
  if (metadata.source === "agent" && !productId) throw new Error("Agent recipient has no product route");
  const raw = await object.arrayBuffer();
  const parsed = await PostalMime.parse(raw);
  const headers = new Map(parsed.headers.map(h => [h.key.toLowerCase(), h.value]));
  const auth = (metadata.authenticationResults ?? "").toLowerCase();
  const dkim = auth.match(/dkim=([a-z]+)/)?.[1];
  const result = await processInboundEmail(db, {
    provider: "cloudflare",
    fromEmail: metadata.from,
    toEmail: metadata.to,
    fromName: parsed.from?.name,
    subject: parsed.subject || "(no subject)",
    bodyPlain: parsed.text || undefined,
    bodyHtml: parsed.html || undefined,
    messageId: parsed.messageId || `<${job.key.slice(8, -4)}@onfire-ingress>`,
    inReplyTo: headers.get("in-reply-to"),
    references: headers.get("references"),
    autoSubmitted: headers.get("auto-submitted"),
    precedence: headers.get("precedence"),
    listId: headers.get("list-id"),
    returnPath: headers.get("return-path"),
    spfResult: auth.match(/spf=([a-z]+)/)?.[1],
    dkimResult: dkim ? dkim === "pass" : undefined,
  }, productId);
  if (result.action === "error") throw new Error(result.reason || "Queued inbound processing failed");
  // Keep raw objects for replay, including duplicate references already queued.
  // The dedicated bucket's 30-day lifecycle expires them independently.
  return result;
}
