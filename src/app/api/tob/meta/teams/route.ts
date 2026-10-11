import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { getTeams } from "@/services/admin/metadata";

export const GET = withAuth({ permission: "agent.profile" }, async (_req, ctx) => ok(await getTeams(ctx)));
