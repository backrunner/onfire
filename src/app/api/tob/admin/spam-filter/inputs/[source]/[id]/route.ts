import { withAuth } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { loadFilteredInput, parseFilteredInputSource } from "@/services/filtered-inputs";

export const GET = withAuth({ permission: "spam.config" }, async (_req, ctx) => ok(await loadFilteredInput(ctx, parseFilteredInputSource(ctx.params.source), ctx.params.id)));
