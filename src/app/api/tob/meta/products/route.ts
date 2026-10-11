import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { getProducts } from "@/services/admin/metadata";

export const GET = withAuth({ permission: "agent.profile" }, async (_req, ctx) => ok(await getProducts(ctx)));
