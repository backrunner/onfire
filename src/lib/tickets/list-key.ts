import { ticketSort } from "./sort";

/** The SSR and client workspace must address exactly the same SWR resource. */
export function ticketsListKey(params: { get(name: string): string | null }): string {
  const query = new URLSearchParams();
  for (const [name, key] of [["status", "status"], ["priority", "priority"], ["productId", "product"], ["teamId", "team"], ["q", "q"]]) {
    const value = params.get(key);
    if (value) query.set(name, value);
  }
  if (params.get("overdue") === "true") query.set("overdue", "true");
  const sort = ticketSort(params.get("sort"));
  if (sort !== "priority") query.set("sort", sort);
  query.set("page", String(Math.max(1, Number(params.get("page")) || 1)));
  query.set("pageSize", "25");
  query.set("summary", "true");
  return `/api/tob/tickets?${query}`;
}
