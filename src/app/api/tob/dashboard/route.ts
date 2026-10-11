import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { getDashboard } from "@/services/admin/dashboard";

export const GET = withAuth({ permission: "ticket.read" }, async (_req, ctx) => {
  const response = ok(await getDashboard(ctx));
  response.headers.set("Cache-Control", "no-store");
  return response;
});
