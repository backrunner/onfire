import { z } from "zod";

const probability = z.number().min(0).max(1);
export const decisionAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), noul: probability }),
  z.object({
    type: z.literal("choice"),
    choice: z.string().min(1),
    confidence: probability,
    probabilities: z.record(z.string(), probability),
  }),
]);

/** Stored with screening results, never projected to customer APIs. */
export const decisionAuditSchema = z.object({
  provider: z.literal("typesafe"),
  model: z.string().min(1),
  answers: z.record(z.string(), decisionAnswerSchema),
});
