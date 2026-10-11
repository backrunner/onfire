import { SWRConfig } from "swr";
import { getAdminContext } from "@/lib/auth/admin-context";
import { listTickets, listQuerySchema } from "@/services/admin/tickets";
import { getProducts, getTeams } from "@/services/admin/metadata";
import { ticketsListKey } from "@/lib/tickets/list-key";
import { TicketsWorkspace } from "@/components/admin/tickets/tickets-workspace";
import { hasPermission } from "@/lib/types";
import { notFound } from "next/navigation";

export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getAdminContext();
  if (!hasPermission(ctx.role, "ticket.read") || !hasPermission(ctx.role, "agent.profile")) notFound();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") params.set(key, first);
  }
  const initialKey = ticketsListKey(params);
  const query = listQuerySchema.safeParse(Object.fromEntries(new URL(initialKey, "http://onfire.local").searchParams));
  const [initialData, products, teams] = await Promise.all([
    query.success ? listTickets(ctx, query.data) : undefined, getProducts(ctx), getTeams(ctx),
  ]);
  return <SWRConfig value={{ fallback: { "/api/tob/meta/products": products, "/api/tob/meta/teams": teams } }}>
    <TicketsWorkspace initialKey={initialKey} initialData={initialData} />
  </SWRConfig>;
}
