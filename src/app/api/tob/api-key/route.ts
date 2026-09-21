import { withAuth } from "@/lib/api/handler";
import { forbidden, ok } from "@/lib/api/response";
import {
  apiKeyOperations,
  describeApiKeyOperation,
} from "@/lib/api-keys/catalog";

/** Authenticated discovery describes only this key's current effective authority. */
export const GET = withAuth({}, async (_req, ctx) => {
  if (!ctx.apiKey) throw forbidden("An account API key is required");
  return ok({
    key: ctx.apiKey,
    user: { id: ctx.user.id, role: ctx.role },
    operations: apiKeyOperations
      .filter((op) => ctx.apiKey!.permissions.includes(op.id))
      .map(describeApiKeyOperation),
  });
});
