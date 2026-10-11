import { ok } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { listCustomers, customerQuerySchema } from "@/services/admin/customers";

export const GET = withAuth({ permission: "customer.read" }, async (req, ctx) => ok(await listCustomers(ctx, parseQuery(req, customerQuerySchema))));
