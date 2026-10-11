import { ok } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { listTickets, listQuerySchema } from "@/services/admin/tickets";

export const GET = withAuth({ permission: "ticket.read" }, async (req, ctx) =>
  ok(await listTickets(ctx, parseQuery(req, listQuerySchema)))
);
