import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { restoreFilteredInput, parseFilteredInputSource } from "@/services/filtered-inputs";

const schema = z.object({ reason: z.string().trim().min(1).max(1000), ticketTypeId: z.string().min(1).optional() });
export const POST = withAuth({ permission: "spam.config" }, async (req, ctx) => ok(await restoreFilteredInput(ctx, parseFilteredInputSource(ctx.params.source), ctx.params.id, await parseBody(req, schema))));
