import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { getMe } from "@/services/admin/me";

export const GET = withAuth({}, async (_req, ctx) => ok(await getMe(ctx)));
