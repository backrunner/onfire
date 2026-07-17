import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

const migrationsDir = join(__dirname, "../../drizzle/migrations");

async function applyMigration(
  client: ReturnType<typeof createClient>,
  filename: string
) {
  const sql = readFileSync(join(migrationsDir, filename), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) await client.execute(trimmed);
  }
}

describe("legacy ticket type migration", () => {
  it("migrates multiple templates and tolerates malformed ticket metadata", async () => {
    const client = createClient({ url: ":memory:" });
    const migrations = [
      "0000_lame_gauntlet.sql",
      "0001_youthful_mulholland_black.sql",
      "0002_concerned_sugar_man.sql",
      "0003_customer_identity_optional.sql",
      "0004_low_orphan.sql",
      "0005_wandering_doctor_spectrum.sql",
      "0006_lowly_sunset_bain.sql",
      "0007_fair_starbolt.sql",
      "0008_bright_cobalt_man.sql",
      "0009_freezing_slayback.sql",
      "0010_busy_the_hunter.sql",
      "0011_easy_the_leader.sql",
      "0012_normal_old_lace.sql",
    ];
    for (const migration of migrations) await applyMigration(client, migration);

    await client.execute({
      sql: "INSERT INTO products (id, tenant_id, name) VALUES (?, ?, ?)",
      args: ["product-1", "tenant-1", "Product"],
    });
    await client.execute({
      sql: "INSERT INTO templates (id, product_id, title, categories, form_schema) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
      args: [
        "template-1",
        "product-1",
        "Login issue",
        "[]",
        '{"fields":[]}',
        "template-2",
        "product-1",
        "Billing issue",
        "[]",
        '{"fields":[]}',
      ],
    });
    await client.execute({
      sql: "INSERT INTO tickets (id, tenant_id, product_id, team_id, status, priority, subject, content, customer_email, template_id, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        "ticket-1",
        "tenant-1",
        "product-1",
        "team-1",
        "new",
        "medium",
        "Cannot sign in",
        "The sign-in form fails",
        "customer@example.com",
        "template-1",
        "{malformed",
        "2026-07-17T00:00:00.000Z",
        "2026-07-17T00:00:00.000Z",
      ],
    });

    await applyMigration(client, "0013_big_psynapse.sql");

    const typeRows = await client.execute(
      "SELECT id, system_key FROM ticket_types WHERE product_id = 'product-1' ORDER BY id"
    );
    expect(typeRows.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "legacy-type:template-1",
          system_key: "legacy:template-1",
        }),
        expect.objectContaining({
          id: "legacy-type:template-2",
          system_key: "legacy:template-2",
        }),
        expect.objectContaining({
          id: "system-unclassified:product-1",
          system_key: "unclassified",
        }),
      ])
    );

    const migrated = await client.execute(
      "SELECT ticket_type_id, template_version_id, ticket_type_path FROM tickets WHERE id = 'ticket-1'"
    );
    expect(migrated.rows[0]).toMatchObject({
      ticket_type_id: "legacy-type:template-1",
      template_version_id: "legacy-version:template-1",
    });
    expect(JSON.parse(String(migrated.rows[0]?.ticket_type_path))).toEqual([
      { id: "legacy-type:template-1", name: "Login issue" },
    ]);

    client.close();
  });
});
