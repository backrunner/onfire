import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { tickets } from "@/drizzle/schema";
import { parseTicketNumber } from "./number";

export function ticketNumberSearchCondition(query: string): SQL {
  const number = parseTicketNumber(query);
  return number === null ? sql`0` : sql`${tickets.number} = ${number}`;
}

/** Search JSON translation values without matching the language keys. */
export function translationSearchCondition(
  column: SQLWrapper,
  query: string,
): SQL {
  return sql`EXISTS (
    SELECT 1
    FROM json_each(CASE
      WHEN json_valid(${column}) THEN ${column}
      ELSE '{}'
    END) AS translation
    WHERE typeof(translation.value) = 'text'
      AND instr(lower(translation.value), lower(${query})) > 0
  )`;
}
