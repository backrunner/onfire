import { z } from "zod";

export const closeTicketSchema = z.object({
  reason: z.string().max(2000).optional(),
  notifyCustomer: z.boolean().default(true).describe("Send the configured customer closure email. Set false to close silently; staff notifications and history are preserved."),
});
