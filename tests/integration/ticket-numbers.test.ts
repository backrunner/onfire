import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

const migrationsDir = join(__dirname, "../../drizzle/migrations");
const migration = "0033_ticket_numbers.sql";

async function apply(client: ReturnType<typeof createClient>, file: string) {
  for (const statement of readFileSync(join(migrationsDir, file), "utf8").split("--> statement-breakpoint")) {
    if (statement.trim()) await client.execute(statement.trim());
  }
}

function insert(id: string, date = "2026-10-12T00:00:00Z", product = "product") {
  return {
    sql: "INSERT INTO tickets (id, tenant_id, product_id, team_id, status, priority, subject, content, created_at, updated_at) VALUES (?, 'tenant', ?, 'team', 'new', 'medium', 'Subject', 'Body', ?, ?)",
    args: [id, product, date, date],
  };
}

describe("database ticket numbers", () => {
  it("backfills chronological numbers without changing UUIDs or reply links, then allocates without reuse", async () => {
    const client = createClient({ url: ":memory:" });
    try {
      for (const file of readdirSync(migrationsDir).filter(file => file.endsWith(".sql") && file < migration).sort()) await apply(client, file);
      await client.execute(insert("later", "2026-10-11T01:00:00Z"));
      await client.execute(insert("early-b", "2026-10-10T00:00:00Z"));
      await client.execute(insert("early-a", "2026-10-10T00:00:00Z"));
      await client.execute("INSERT INTO replies (id, ticket_id, content, created_at) VALUES ('reply', 'later', 'Reply', '2026-10-11')");
      await apply(client, migration);
      expect((await client.execute("SELECT id, number FROM tickets ORDER BY number")).rows).toEqual([
        { id: "early-a", number: 1 }, { id: "early-b", number: 2 }, { id: "later", number: 3 },
      ]);
      expect((await client.execute("SELECT ticket_id FROM replies")).rows[0]?.ticket_id).toBe("later");

      await Promise.all(Array.from({ length: 20 }, (_, i) => client.execute(insert(`new-${i}`, undefined, `product-${i % 2}`))));
      const numbers = (await client.execute("SELECT number FROM tickets ORDER BY number")).rows.map(row => row.number);
      expect(numbers).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
      await client.execute("DELETE FROM tickets WHERE number = 23");
      await client.execute(insert("after-delete"));
      expect((await client.execute("SELECT number FROM tickets WHERE id = 'after-delete'")).rows[0]?.number).toBe(24);
      await expect(client.execute("UPDATE tickets SET number = 99 WHERE id = 'later'")).rejects.toThrow("immutable");
      await expect(client.execute({ ...insert("forged"), sql: insert("forged").sql.replace("(id, tenant_id", "(number, id, tenant_id").replace("VALUES (?,", "VALUES (99, ?,") })).rejects.toThrow("allocated by the database");
      await expect(client.batch([insert("rolled-back"), insert("later")], "write")).rejects.toThrow();
      await client.execute(insert("after-rollback"));
      expect((await client.execute("SELECT number FROM tickets WHERE id = 'after-rollback'")).rows[0]?.number).toBe(25);
      expect((await client.execute("SELECT id FROM tickets WHERE number = 0")).rows).toEqual([]);
    } finally {
      client.close();
    }
  });
});
