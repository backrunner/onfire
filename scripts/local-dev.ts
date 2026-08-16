/**
 * Local D1 bootstrap for OnFire.
 *
 *   pnpm db:reset           wipe local D1, apply migrations, seed demo data
 *   pnpm db:seed            seed demo tenant/product/admin if missing
 *   pnpm db:seed:tickets    insert sample tickets (repeatable)
 *
 * Login after reset/seed:
 *   Email     admin@local.onfire
 *   Password  admin
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { hashPassword } from "better-auth/crypto";

const ROOT = process.cwd();
const D1_DIR = join(ROOT, ".wrangler/state/v3/d1");
const D1_OBJECTS = join(D1_DIR, "miniflare-D1DatabaseObject");

const IDS = {
  tenant: "tenant-local",
  product: "product-local",
  team: "team-local",
  admin: "user-admin",
  productAdmin: "user-product-admin",
  agent: "user-agent",
  unclassified: "type-unclassified",
  billing: "type-billing",
  technical: "type-technical",
  template: "tpl-technical",
  templateVersion: "tplv-technical-1",
  vipState: "state-technical-vip",
  notifyRule: "rule-local-created",
} as const;

const ADMIN_EMAIL = "admin@local.onfire";
const ADMIN_PASSWORD = "admin";
const PRODUCT_ADMIN_EMAIL = "product@local.onfire";
const AGENT_EMAIL = "agent@local.onfire";

const TECHNICAL_FORM = JSON.stringify({
  version: "1.0",
  fields: [
    {
      id: "environment",
      key: "environment",
      label: "Environment",
      type: "select",
      required: true,
      options: [
        { label: "Production", value: "production" },
        { label: "Staging", value: "staging" },
      ],
    },
    {
      id: "steps",
      key: "steps",
      label: "Steps to reproduce",
      type: "textarea",
      required: true,
    },
  ],
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function listLocalD1Files(): Promise<string[]> {
  if (!existsSync(D1_OBJECTS)) return [];
  const candidates = readdirSync(D1_OBJECTS)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => join(D1_OBJECTS, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  const matches: string[] = [];
  for (const path of candidates) {
    const client = openD1(path);
    try {
      const rows = await client.execute(
        "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1"
      );
      if (rows.rows.length > 0) matches.push(path);
    } catch {
      // Skip leftover or locked sqlite files from older Wrangler runs.
    } finally {
      client.close();
    }
  }
  return matches;
}

function openD1(path: string): Client {
  return createClient({ url: `file:${path}` });
}

async function exec(
  client: Client,
  sql: string,
  args: Array<string | number | null> = []
) {
  await client.execute({ sql, args });
}

async function hasRow(
  client: Client,
  sql: string,
  args: Array<string | number> = []
) {
  const result = await client.execute({ sql, args });
  return result.rows.length > 0;
}

function applyMigrations() {
  const result = spawnSync(
    "pnpm",
    ["exec", "wrangler", "d1", "migrations", "apply", "DB", "--local"],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, CI: "1" },
    }
  );
  if (result.status !== 0) {
    fail("Failed to apply local D1 migrations.");
  }
}

function resetLocalD1() {
  if (existsSync(D1_DIR)) {
    rmSync(D1_DIR, { recursive: true, force: true });
    console.log("Removed local D1 state.");
  }
  applyMigrations();
}

async function seedBootstrap(client: Client) {
  if (await hasRow(client, "SELECT 1 FROM users WHERE id = ?", [IDS.admin])) {
    return false;
  }

  const now = new Date().toISOString();
  const nowUnix = Math.floor(Date.now() / 1000);
  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  await exec(
    client,
    `INSERT INTO tenants (id, name, default_team_id) VALUES (?, ?, ?)`,
    [IDS.tenant, "Local Demo", IDS.team]
  );
  await exec(
    client,
    `INSERT INTO teams (id, tenant_id, product_id, scope, name, allow_reassign)
     VALUES (?, ?, NULL, 'tenant', ?, 1)`,
    [IDS.team, IDS.tenant, "Default Team"]
  );
  await exec(
    client,
    `INSERT INTO products (
       id, tenant_id, name, homepage_url, portal_return_url,
       sla_high_accept, sla_high_reply, sla_medium_accept, sla_medium_reply,
       sla_low_accept, sla_low_reply, auto_close_minutes
     ) VALUES (?, ?, ?, ?, ?, 15, 30, 60, 120, 240, 480, 2880)`,
    [
      IDS.product,
      IDS.tenant,
      "Acme Support",
      "https://example.com",
      "https://example.com/support",
    ]
  );
  await exec(client, `INSERT INTO product_teams (product_id, team_id) VALUES (?, ?)`, [
    IDS.product,
    IDS.team,
  ]);

  const typeRows: Array<[string, string, number, string, string | null, number]> = [
    [
      IDS.unclassified,
      "Unclassified",
      -2147483648,
      "System fallback for messages that cannot be classified",
      "unclassified",
      1,
    ],
    [IDS.billing, "Billing", 10, "Invoices, refunds, and plan changes", null, 1],
    [IDS.technical, "Technical", 20, "Product bugs and integration issues", null, 1],
  ];
  for (const [id, name, sort, description, systemKey, level] of typeRows) {
    await exec(
      client,
      `INSERT INTO ticket_types (
         id, product_id, parent_id, level, name, description, sort_order,
         system_key, archived_at, archived_by, created_at, updated_at
       ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      [id, IDS.product, level, name, description, sort, systemKey, now, now]
    );
  }
  for (const typeId of [IDS.billing, IDS.technical]) {
    await exec(
      client,
      `INSERT INTO ticket_type_routes (ticket_type_id, team_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [typeId, IDS.team, IDS.admin, now, now]
    );
  }

  await exec(
    client,
    `INSERT INTO ticket_templates (id, ticket_type_id, current_version_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [IDS.template, IDS.technical, IDS.templateVersion, now, now]
  );
  await exec(
    client,
    `INSERT INTO ticket_template_versions (
       id, template_id, version, form_schema, change_note, created_by, created_at
     ) VALUES (?, ?, 1, ?, 'Initial local form', ?, ?)`,
    [IDS.templateVersion, IDS.template, TECHNICAL_FORM, IDS.admin, now]
  );
  await exec(
    client,
    `INSERT INTO ticket_type_internal_states (
       id, ticket_type_id, name, description, kind, options, sort_order, created_by, created_at, updated_at
     ) VALUES (?, ?, 'VIP', 'Mark a ticket as VIP', 'boolean', NULL, 0, ?, ?, ?)`,
    [IDS.vipState, IDS.technical, IDS.admin, now, now]
  );

  const staff: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    level?: number;
  }> = [
    { id: IDS.admin, email: ADMIN_EMAIL, name: "Local Admin", role: "super_admin", level: 8 },
    {
      id: IDS.productAdmin,
      email: PRODUCT_ADMIN_EMAIL,
      name: "Local Product Admin",
      role: "product_admin",
    },
    { id: IDS.agent, email: AGENT_EMAIL, name: "Local Agent", role: "agent", level: 3 },
  ];

  for (const person of staff) {
    await exec(
      client,
      `INSERT INTO user (id, name, email, email_verified, image, two_factor_enabled, created_at, updated_at)
       VALUES (?, ?, ?, 1, NULL, 0, ?, ?)`,
      [person.id, person.name, person.email, nowUnix, nowUnix]
    );
    await exec(
      client,
      `INSERT INTO account (
         id, issuer, account_id, provider_id, user_id, password, created_at, updated_at
       ) VALUES (?, 'local:credential', ?, 'credential', ?, ?, ?, ?)`,
      [`acct-${person.id}`, person.id, person.id, passwordHash, nowUnix, nowUnix]
    );
    await exec(
      client,
      `INSERT INTO users (id, email, display_name, tenant_id, role) VALUES (?, ?, ?, ?, ?)`,
      [person.id, person.email, person.name, IDS.tenant, person.role]
    );
    await exec(
      client,
      `INSERT INTO notification_endpoints (
         id, user_id, channel_type, name, enabled, config, created_at, updated_at
       ) VALUES (?, ?, 'email', 'Account email', 1, ?, ?, ?)`,
      [
        `endpoint-${person.id}`,
        person.id,
        JSON.stringify({ email: person.email }),
        now,
        now,
      ]
    );
    if (person.level !== undefined) {
      await exec(
        client,
        `INSERT INTO agents (user_id, level, active) VALUES (?, ?, 1)`,
        [person.id, person.level]
      );
      await exec(client, `INSERT INTO agent_teams (user_id, team_id) VALUES (?, ?)`, [
        person.id,
        IDS.team,
      ]);
    }
  }

  await exec(
    client,
    `INSERT INTO user_products (user_id, product_id) VALUES (?, ?)`,
    [IDS.productAdmin, IDS.product]
  );
  await exec(
    client,
    `INSERT INTO notification_rules (
       id, product_id, name, enabled, trigger_events, channel_types,
       recipient_type, recipient_team_id, recipient_user_id, created_at, updated_at
     ) VALUES (?, ?, 'New ticket to assignee', 1, ?, ?, 'assignee', NULL, NULL, ?, ?)`,
    [
      IDS.notifyRule,
      IDS.product,
      JSON.stringify(["ticket_created"]),
      JSON.stringify(["email"]),
      now,
      now,
    ]
  );

  return true;
}

function isoMinutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function isoMinutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function seedTickets(client: Client, count: number) {
  if (!(await hasRow(client, "SELECT 1 FROM products WHERE id = ?", [IDS.product]))) {
    fail("Local demo product is missing. Run `pnpm db:seed` or `pnpm db:reset` first.");
  }

  const now = new Date().toISOString();
  const samples = [
    {
      status: "new",
      priority: "high",
      typeId: IDS.billing,
      typeName: "Billing",
      subject: "Invoice charged twice",
      content: "We were billed twice for the March invoice. Please refund the duplicate.",
      assigneeId: null,
      acceptAgo: 40,
      replyAgo: null,
    },
    {
      status: "processing",
      priority: "medium",
      typeId: IDS.technical,
      typeName: "Technical",
      subject: "SSO login loop on staging",
      content: "Signing in with SSO redirects back to the login page.",
      assigneeId: IDS.agent,
      acceptAgo: null,
      replyAgo: 90,
    },
    {
      status: "replied",
      priority: "low",
      typeId: IDS.billing,
      typeName: "Billing",
      subject: "Need a copy of last receipt",
      content: "Can you resend the December receipt to finance?",
      assigneeId: IDS.admin,
      acceptAgo: null,
      replyAgo: null,
    },
    {
      status: "escalated",
      priority: "high",
      typeId: IDS.technical,
      typeName: "Technical",
      subject: "Production webhook retries failing",
      content: "Outbound webhooks return 502 after the last deploy.",
      assigneeId: IDS.admin,
      acceptAgo: null,
      replyAgo: 20,
    },
    {
      status: "closed",
      priority: "medium",
      typeId: IDS.billing,
      typeName: "Billing",
      subject: "Plan upgrade completed",
      content: "Thanks, the workspace is now on the team plan.",
      assigneeId: IDS.agent,
      acceptAgo: null,
      replyAgo: null,
    },
  ];

  let inserted = 0;
  for (let index = 0; index < count; index += 1) {
    const sample = samples[index % samples.length]!;
    const ticketId = crypto.randomUUID();
    const customerId = crypto.randomUUID();
    const customerEmail = `customer${index + 1}@example.com`;
    const createdAt = isoMinutesAgo(30 + index * 15);
    const path = JSON.stringify([{ id: sample.typeId, name: sample.typeName }]);
    const metadata =
      sample.typeId === IDS.technical
        ? JSON.stringify({
            environment: index % 2 === 0 ? "production" : "staging",
            steps: "1. Open the app\n2. Trigger the action\n3. Observe the error",
          })
        : null;

    await exec(
      client,
      `INSERT INTO customers (id, tenant_id, product_id, email, external_id, level, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        customerId,
        IDS.tenant,
        IDS.product,
        customerEmail,
        `ext-${index + 1}`,
        50 + (index % 5) * 10,
        createdAt,
        now,
      ]
    );

    await exec(
      client,
      `INSERT INTO tickets (
         id, tenant_id, product_id, team_id, assignee_id, status, priority,
         subject, content, customer_id, customer_email, customer_level,
         ticket_type_id, template_version_id, ticket_type_path, template_id,
         metadata, sla_accept_deadline, sla_reply_deadline, sla_accept_breached,
         sla_reply_breached, sla_accept_warned, sla_reply_warned, source,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 0, 0, 'web', ?, ?)`,
      [
        ticketId,
        IDS.tenant,
        IDS.product,
        IDS.team,
        sample.assigneeId,
        sample.status,
        sample.priority,
        `${sample.subject} #${index + 1}`,
        sample.content,
        customerId,
        customerEmail,
        50 + (index % 5) * 10,
        sample.typeId,
        sample.typeId === IDS.technical ? IDS.templateVersion : null,
        path,
        metadata,
        sample.acceptAgo ? isoMinutesAgo(sample.acceptAgo) : isoMinutesFromNow(45),
        sample.replyAgo ? isoMinutesAgo(sample.replyAgo) : sample.assigneeId ? isoMinutesFromNow(60) : null,
        sample.acceptAgo ? 1 : 0,
        sample.replyAgo ? 1 : 0,
        createdAt,
        now,
      ]
    );

    await exec(
      client,
      `INSERT INTO history (id, ticket_id, actor_id, action, snapshot, created_at)
       VALUES (?, ?, NULL, 'created', ?, ?)`,
      [crypto.randomUUID(), ticketId, JSON.stringify({ source: "local-seed" }), createdAt]
    );

    if (sample.assigneeId) {
      await exec(
        client,
        `INSERT INTO history (id, ticket_id, actor_id, action, snapshot, created_at)
         VALUES (?, ?, ?, 'assigned', ?, ?)`,
        [
          crypto.randomUUID(),
          ticketId,
          sample.assigneeId,
          JSON.stringify({ assigneeId: sample.assigneeId }),
          createdAt,
        ]
      );
    }

    if (sample.status === "replied" || sample.status === "closed") {
      await exec(
        client,
        `INSERT INTO replies (id, ticket_id, sender_id, sender_email, content, internal, source, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 'web', ?)`,
        [
          crypto.randomUUID(),
          ticketId,
          sample.assigneeId ?? IDS.admin,
          sample.assigneeId === IDS.agent ? AGENT_EMAIL : ADMIN_EMAIL,
          "Thanks for the report. We are looking into this now.",
          isoMinutesAgo(10),
        ]
      );
    }

    inserted += 1;
  }
  return inserted;
}

function printLoginHelp() {
  console.log("");
  console.log("ToB login  http://localhost:3001/admin/login");
  console.log(`  SuperAdmin     ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  ProductAdmin   ${PRODUCT_ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Agent          ${AGENT_EMAIL} / ${ADMIN_PASSWORD}`);
}

async function withLocalDatabases(
  work: (client: Client, path: string) => Promise<void> | void
) {
  const files = await listLocalD1Files();
  if (files.length === 0) {
    fail("No local D1 database found. Run `pnpm db:migrate:local` or `pnpm db:reset` first.");
  }
  for (const path of files) {
    const client = openD1(path);
    try {
      await work(client, path);
    } finally {
      client.close();
    }
  }
}

async function commandSeed() {
  const files = await listLocalD1Files();
  if (files.length === 0) {
    applyMigrations();
  }
  let created = false;
  await withLocalDatabases(async (client, path) => {
    const seeded = await seedBootstrap(client);
    created = created || seeded;
    console.log(`${seeded ? "Seeded" : "Already seeded"} ${path}`);
  });
  if (created) printLoginHelp();
}

async function commandTickets(count: number) {
  await withLocalDatabases(async (client, path) => {
    const inserted = await seedTickets(client, count);
    console.log(`Inserted ${inserted} tickets into ${path}`);
  });
}

function parseCount(argv: string[]) {
  const flagged = argv.find((arg) => arg.startsWith("--count="));
  if (flagged) {
    const value = Number(flagged.slice("--count=".length));
    if (!Number.isInteger(value) || value < 1) fail("--count must be a positive integer");
    return value;
  }
  const index = argv.indexOf("--count");
  if (index >= 0) {
    const value = Number(argv[index + 1]);
    if (!Number.isInteger(value) || value < 1) fail("--count must be a positive integer");
    return value;
  }
  return 12;
}

function usage() {
  console.log(`Usage:
  pnpm db:reset                 Wipe local D1, migrate, and seed demo data
  pnpm db:seed                  Seed demo tenant/product/admin if missing
  pnpm db:seed:tickets [--count 12]   Insert sample tickets
`);
}

const command = process.argv[2] ?? "help";

if (command === "reset") {
  resetLocalD1();
  await commandSeed();
  await commandTickets(parseCount(process.argv.slice(3)));
  console.log("Local environment is ready.");
} else if (command === "seed") {
  await commandSeed();
} else if (command === "tickets") {
  await commandTickets(parseCount(process.argv.slice(3)));
} else {
  usage();
  process.exit(command === "help" ? 0 : 1);
}
