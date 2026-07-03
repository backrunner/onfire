import { ok } from "@/lib/api/response";
import { withPublic } from "@/lib/api/handler";

export const GET = withPublic(async () =>
  ok({ ok: true, scope: "tob", ts: Date.now() })
);
