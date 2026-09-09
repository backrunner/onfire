import { z } from "zod";
import type { EmailMessage } from "../services/email/providers";

export const deliveryReceiptSchema = z.object({
  id: z.string().min(1).max(128),
  token: z.string().uuid(),
  status: z.enum(["sent", "retry", "failed", "uncertain"]),
  messageId: z.string().min(1).max(998).optional(),
  error: z.string().max(2000).optional(),
}).strict();
export type DeliveryReceipt = z.infer<typeof deliveryReceiptSchema>;
export type OutboundClaim =
  | { state: "ready"; token: string; message: EmailMessage }
  | { state: "sending"; token: string }
  | { state: "blocked" }
  | { state: "done" };

export interface MailAgentService {
  claim(id: string): Promise<OutboundClaim>;
  complete(receipt: DeliveryReceipt): Promise<void>;
}
