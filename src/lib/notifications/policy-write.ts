import { getTableColumns, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

/** Check lineage inside the insert, so concurrent parent deletion cannot orphan an override. */
export function notificationPolicyInsert(
  table: SQLiteTable,
  values: Record<string, unknown>,
  overridesId: string | null,
) {
  const columns = getTableColumns(table);
  const selection = Object.keys(columns).map(key => {
    const value = values[key] ?? null;
    return sql`${typeof value === "boolean" ? Number(value) : value}`;
  });
  const parentExists = overridesId
    ? sql`exists (select 1 from ${table} where ${columns.id} = ${overridesId} and ${columns.overridesId} is null)`
    : sql`1 = 1`;
  return sql`select ${sql.join(selection, sql`, `)} where ${parentExists}`;
}
