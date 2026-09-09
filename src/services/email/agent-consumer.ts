import { outboundQueueMessage, queueRetryDelay, emailAddressAllowed } from "@/lib/email-queue";
import { deliveryReceiptSchema, type DeliveryReceipt, type MailAgentService } from "@/lib/email-agent-contract";

export interface AgentDeliveryBindings {
  main: MailAgentService;
  storage: R2Bucket;
  sender: SendEmail;
  allowedAddresses: string;
}

function failureReceipt(id: string, token: string, error: unknown): DeliveryReceipt {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  // Only documented pre-acceptance throttling errors are safe to automatically retry.
  const retryable = ["E_RATE_LIMIT_EXCEEDED", "E_DAILY_LIMIT_EXCEEDED"].includes(code);
  const permanent = ["E_VALIDATION_ERROR", "E_FIELD_MISSING", "E_TOO_MANY_RECIPIENTS", "E_SENDER_NOT_VERIFIED",
    "E_RECIPIENT_NOT_ALLOWED", "E_RECIPIENT_SUPPRESSED", "E_SENDER_DOMAIN_NOT_AVAILABLE", "E_CONTENT_TOO_LARGE",
    "E_HEADER_NOT_ALLOWED", "E_HEADER_VALUE_INVALID", "E_HEADER_USE_API_FIELD"].includes(code);
  return { id, token, status: retryable ? "retry" : permanent ? "failed" : "uncertain",
    error: `${code ? `${code}: ` : ""}${error instanceof Error ? error.message : String(error)}`.slice(0, 2000) };
}

export async function consumeAgentOutbound(batch: MessageBatch<unknown>, env: AgentDeliveryBindings): Promise<void> {
  for (const message of batch.messages) {
    try {
      const job = outboundQueueMessage.parse(message.body);
      const claim = await env.main.claim(job.id);
      if (claim.state === "done") { message.ack(); continue; }
      if (claim.state === "blocked") { message.retry({ delaySeconds: 60 }); continue; }
      const key = `receipts/${job.id}/${claim.token}.json`;
      // Replay acknowledgement after a successful send whose callback failed.
      const stored = await env.storage.get(key);
      let receipt: DeliveryReceipt;
      if (stored) {
        receipt = deliveryReceiptSchema.parse(await stored.json());
        if (receipt.id !== job.id || receipt.token !== claim.token) throw new Error("Receipt identity mismatch");
      } else if (claim.state === "sending") {
        // Another invocation owns this attempt. Never send again without a definitive failure.
        message.retry({ delaySeconds: queueRetryDelay(message.attempts) });
        continue;
      } else {
        if (!emailAddressAllowed(claim.message.from, env.allowedAddresses)) throw new Error("Sender is outside this agent's scope");
        try {
          const { fromName, ...payload } = claim.message;
          const result = await env.sender.send({
            ...payload,
            from: fromName ? { email: payload.from, name: fromName } : payload.from,
          });
          receipt = { id: job.id, token: claim.token, status: "sent", messageId: result.messageId };
        } catch (error) {
          receipt = failureReceipt(job.id, claim.token, error);
        }
        await env.storage.put(key, JSON.stringify(receipt), { httpMetadata: { contentType: "application/json" } });
      }
      await env.main.complete(receipt);
      if (receipt.status === "retry") message.retry({ delaySeconds: queueRetryDelay(message.attempts) });
      else message.ack();
    } catch (error) {
      console.error(JSON.stringify({ event: "agent_delivery_failed", messageId: message.id, error: String(error) }));
      message.retry({ delaySeconds: queueRetryDelay(message.attempts) });
    }
  }
}
