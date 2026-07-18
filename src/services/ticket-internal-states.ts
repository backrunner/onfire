import { and, asc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "@/lib/db";
import {
  history,
  ticketInternalStateValues,
  ticketTypeInternalStates,
  tickets,
  type TicketInternalStateKind,
  type TicketTypeInternalStateRow,
} from "@/drizzle/schema";

export class InternalStateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InternalStateValidationError";
  }
}

export function normalizeStateOptions(kind: TicketInternalStateKind, options?: string[] | null) {
  if (kind === "boolean") return null;
  const values = [...new Set((options ?? []).map((value) => value.trim()).filter(Boolean))];
  if (values.length === 0 || values.length > 50 || values.some((value) => value.length > 100)) {
    throw new InternalStateValidationError("Select states require between one and fifty non-empty options");
  }
  return JSON.stringify(values);
}

export function decodeStateOptions(state: Pick<TicketTypeInternalStateRow, "kind" | "options">) {
  if (state.kind !== "select") return [];
  try {
    const parsed = JSON.parse(state.options ?? "[]");
    return Array.isArray(parsed) && parsed.every((value) => typeof value === "string") ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadInternalState(db: Database, stateId: string) {
  return db.query.ticketTypeInternalStates.findFirst({ where: eq(ticketTypeInternalStates.id, stateId) });
}

export async function listInternalStates(db: Database, ticketTypeId: string) {
  return db
    .select()
    .from(ticketTypeInternalStates)
    .where(eq(ticketTypeInternalStates.ticketTypeId, ticketTypeId))
    .orderBy(asc(ticketTypeInternalStates.sortOrder), asc(ticketTypeInternalStates.name));
}

export async function validateStateValue(
  db: Database,
  ticketTypeId: string,
  stateId: string,
  value: unknown
) {
  const state = await loadInternalState(db, stateId);
  if (!state || state.ticketTypeId !== ticketTypeId) throw new InternalStateValidationError("Internal state does not belong to this ticket type");
  if (state.archivedAt) throw new InternalStateValidationError("Archived internal states cannot be changed");
  if (value === null || value === undefined || value === "") return null;
  if (state.kind === "boolean") {
    if (typeof value !== "boolean") throw new InternalStateValidationError("Boolean state values must be true or false");
    return value ? "true" : "false";
  }
  if (typeof value !== "string" || !decodeStateOptions(state).includes(value)) {
    throw new InternalStateValidationError("Value is not one of the configured state options");
  }
  return value;
}

export async function setTicketInternalStateValue(
  db: Database,
  ticketId: string,
  stateId: string,
  value: unknown,
  actorId: string
) {
  const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  if (!ticket) throw new InternalStateValidationError("Ticket not found");
  const normalized = await validateStateValue(db, ticket.ticketTypeId, stateId, value);
  const state = await loadInternalState(db, stateId);
  const previous = await db.query.ticketInternalStateValues.findFirst({
    where: and(eq(ticketInternalStateValues.ticketId, ticketId), eq(ticketInternalStateValues.stateId, stateId)),
  });
  if ((previous?.value ?? null) === normalized) return normalized;
  const now = new Date().toISOString();
  const mutation: BatchItem<"sqlite"> = normalized === null
    ? db.delete(ticketInternalStateValues).where(
        and(eq(ticketInternalStateValues.ticketId, ticketId), eq(ticketInternalStateValues.stateId, stateId))
      )
    : db
        .insert(ticketInternalStateValues)
        .values({ ticketId, stateId, value: normalized, updatedBy: actorId, updatedAt: now })
        .onConflictDoUpdate({
          target: [ticketInternalStateValues.ticketId, ticketInternalStateValues.stateId],
          set: { value: normalized, updatedBy: actorId, updatedAt: now },
        });
  const audit = db.insert(history).values({
    id: crypto.randomUUID(),
    ticketId,
    actorId,
    action: "internal_state_changed",
    snapshot: JSON.stringify({
      stateId,
      stateName: state?.name ?? stateId,
      previousValue: previous?.value ?? null,
      value: normalized,
    }),
    createdAt: now,
  });
  await db.batch([mutation, audit]);
  return normalized;
}

export function serializeState(state: TicketTypeInternalStateRow) {
  return { ...state, options: decodeStateOptions(state) };
}
