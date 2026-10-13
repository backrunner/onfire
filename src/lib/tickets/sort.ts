export const TICKET_SORTS = [
  "priority",
  "updated_desc",
  "updated_asc",
  "created_desc",
  "created_asc",
] as const;

export type TicketSort = (typeof TICKET_SORTS)[number];

export function ticketSort(value: string | null): TicketSort {
  return TICKET_SORTS.find((sort) => sort === value) ?? "priority";
}
