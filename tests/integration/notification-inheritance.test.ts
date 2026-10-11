import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@libsql/client";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "@/lib/db";
import { accountApiKeys, agents, agentTeams, notificationEndpoints, notificationLogs, notificationRules, products, productTeams, teams, tenants, tickets, user, users, userProducts } from "@/drizzle/schema";
import { Role, TicketPriority, TicketStatus } from "@/lib/types";
import { GET as rulesGET, POST as rulesPOST } from "@/app/api/tob/admin/notification-rules/route";
import { PATCH as rulesPATCH, DELETE as rulesDELETE } from "@/app/api/tob/admin/notification-rules/[id]/route";
import { POST as requirementsPOST } from "@/app/api/tob/admin/notification-requirements/route";
import { PATCH as requirementsPATCH, DELETE as requirementsDELETE } from "@/app/api/tob/admin/notification-requirements/[id]/route";
import { GET as complianceGET } from "@/app/api/tob/admin/notification-compliance/route";
import { DELETE as teamDELETE } from "@/app/api/tob/admin/teams/[id]/route";
import { sendRecipientNotifications } from "@/services/notification/service";
import { loadEffectiveNotificationPolicies } from "@/services/notification/policies";
import { generateAccountApiKey } from "@/lib/api-keys/auth";
import { sealPreviewCookie, PREVIEW_COOKIE_NAME } from "@/lib/preview-identity";
import type { NotificationPolicyScope } from "@/lib/notifications/policy-scope";
import { ruleTargetForScope, requirementTargetForScope } from "@/lib/notifications/policy-recipients";
import * as overrideValidation from "@/lib/notifications/policy-overrides";
import { createTestDb, NOW } from "./test-db";

let db: Database;
let actorId: string | null;
const secret = "notification-inheritance-test-secret";
const send = vi.fn(async () => ({ success: true }));
vi.mock("@/lib/db", () => ({ getDb: () => db, getEnv: () => ({ AUTH_SECRET: secret, BETTER_AUTH_URL: "https://admin.example.com" }) }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: async () => actorId ? { user: { id: actorId } } : null } }) }));
vi.mock("@/services/notification/channels", () => ({ createChannel: vi.fn(async () => ({ send })) }));
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const tenant: NotificationPolicyScope = { scope: "tenant", tenantId: "tenant" };
const team: NotificationPolicyScope = { scope: "team", teamId: "team-a" };
const product: NotificationPolicyScope = { scope: "product", productId: "product" };
const fields = { name: "New tickets", enabled: true, triggerEvents: ["ticket_created"], channelTypes: ["ntfy"], recipientType: "assignee" };
function req(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`https://admin.example.com/api/tob/admin/${path}`, { method,
    headers: { origin: "https://admin.example.com", "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const idResult = z.object({ data: z.object({ id: z.string() }) });
const rulesResult = z.object({ data: z.array(z.object({ id: z.string(), inherited: z.boolean(), scope: z.string(), overridesId: z.string().nullable(), enabled: z.boolean().nullable(), channelTypes: z.array(z.string()) })) });
async function createRule(owner: NotificationPolicyScope, extra: Record<string, unknown> = {}) {
  const response = await rulesPOST(req("notification-rules", "POST", { ...fields, ...owner, ...extra }));
  expect(response.status).toBe(201);
  return idResult.parse(await response.json()).data.id;
}
async function createRequirement(owner: NotificationPolicyScope, extra: Record<string, unknown> = {}) {
  const response = await requirementsPOST(req("notification-requirements", "POST", { name: "Required methods", enabled: true, scopeType: "product", triggerEvents: ["ticket_created"], channelTypes: ["email"], ...owner, ...extra }));
  expect(response.status).toBe(201);
  return idResult.parse(await response.json()).data.id;
}

beforeEach(async () => {
  db = await createTestDb(); actorId = "super"; send.mockClear();
  await db.insert(tenants).values([{ id: "tenant", name: "Tenant" }, { id: "foreign", name: "Foreign" }]);
  await db.insert(products).values([{ id: "product", name: "Product", tenantId: "tenant" }, { id: "other-product", name: "Other", tenantId: "tenant" }, { id: "foreign-product", name: "Foreign", tenantId: "foreign" }]);
  await db.insert(teams).values([
    { id: "team-a", name: "Team A", tenantId: "tenant", scope: "tenant" },
    { id: "team-b", name: "Team B", tenantId: "tenant", scope: "tenant" },
    { id: "product-team", name: "Product team", tenantId: "tenant", scope: "product", productId: "product" },
    { id: "foreign-team", name: "Foreign team", tenantId: "foreign", scope: "tenant" },
    { id: "system-team", name: "System team", scope: "system" },
  ]);
  await db.insert(productTeams).values([{ productId: "product", teamId: "team-a" }, { productId: "product", teamId: "team-b" }, { productId: "product", teamId: "product-team" }, { productId: "other-product", teamId: "team-a" }]);
  const actors = [
    { id: "super", role: Role.SuperAdmin }, { id: "tenant-admin", role: Role.TenantAdmin },
    { id: "product-admin", role: Role.ProductAdmin }, { id: "team-admin", role: Role.TeamAdmin },
    { id: "agent", role: Role.Agent }, { id: "agent-b", role: Role.Agent },
  ];
  await db.insert(users).values(actors.map(a => ({ ...a, tenantId: "tenant", displayName: a.id, email: `${a.id}@example.test` })));
  await db.insert(agents).values([{ userId: "agent" }, { userId: "agent-b" }, { userId: "team-admin" }]);
  await db.insert(agentTeams).values([{ userId: "agent", teamId: "team-a" }, { userId: "agent-b", teamId: "team-b" }, { userId: "team-admin", teamId: "team-a" }]);
  await db.insert(userProducts).values({ userId: "product-admin", productId: "product" });
  await db.insert(notificationEndpoints).values({ id: "endpoint", userId: "agent", name: "Test", channelType: "ntfy", enabled: true, config: JSON.stringify({ topic: "fixture" }), createdAt: NOW(), updatedAt: NOW() });
  await db.insert(tickets).values({ id: "ticket", tenantId: "tenant", productId: "product", teamId: "team-a", assigneeId: "agent", status: TicketStatus.New, priority: TicketPriority.Medium, subject: "Inheritance", content: "Test", customerEmail: "customer@example.test", createdAt: NOW(), updatedAt: NOW() });
});

describe("scoped notification inheritance", () => {
  it("resolves tenant -> current team -> product, masks disabled overrides and restores inheritance", async () => {
    const root = await createRule(tenant);
    const teamOverride = await createRule(team, { overridesId: root, channelTypes: ["ntfy"] });
    const productOverride = await createRule(product, { contextTeamId: "team-a", overridesId: root, enabled: false });
    const effective = await loadEffectiveNotificationPolicies(db, product, "team-a");
    expect(effective.rules.map(r => r.id)).toEqual([productOverride]);
    await sendRecipientNotifications(db, { ticketId: "ticket", triggerEvent: "ticket_created" });
    expect(send).not.toHaveBeenCalled();
    expect(await db.select().from(notificationLogs)).toHaveLength(0);
    expect((await rulesDELETE(req(`notification-rules/${productOverride}`, "DELETE"), params(productOverride))).status).toBe(200);
    expect((await loadEffectiveNotificationPolicies(db, product, "team-a")).rules.map(r => r.id)).toEqual([teamOverride]);
    await sendRecipientNotifications(db, { ticketId: "ticket", triggerEvent: "ticket_created" });
    expect(send).toHaveBeenCalledOnce();
    expect((await db.select().from(notificationLogs))[0]).toMatchObject({ productId: "product", ruleId: teamOverride, status: "sent" });
    await rulesPATCH(req(`notification-rules/${root}`, "PATCH", { channelTypes: ["bark"] }), params(root));
    expect((await loadEffectiveNotificationPolicies(db, product, "team-b")).rules[0].channelTypes).toBe('["bark"]');
    expect((await loadEffectiveNotificationPolicies(db, product, "team-a")).rules[0].channelTypes).toBe('["ntfy"]');
  });

  it("never combines unrelated teams and follows the ticket's current team after reassignment", async () => {
    const root = await createRule(team);
    const override = await createRule(product, { contextTeamId: "team-a", overridesId: root });
    await createRule({ scope: "team", teamId: "team-b" }, { channelTypes: ["email"] });
    expect((await loadEffectiveNotificationPolicies(db, product, "team-a")).rules.map(r => r.id)).toEqual([override]);
    expect((await loadEffectiveNotificationPolicies(db, product, "team-b")).rules).toHaveLength(1);
    expect((await loadEffectiveNotificationPolicies(db, product, "team-b")).rules[0].scope).toBe("team");
    await db.update(tickets).set({ teamId: "team-b", assigneeId: "agent-b" }).where(eq(tickets.id, "ticket"));
    await sendRecipientNotifications(db, { ticketId: "ticket", triggerEvent: "ticket_created" });
    expect(send).not.toHaveBeenCalled();
    expect((await db.select().from(notificationLogs))[0]).toMatchObject({ channelType: "email", recipientUserId: "agent-b", status: "failed" });
    expect((await loadEffectiveNotificationPolicies(db, product, "foreign-team")).rules).toHaveLength(0);
    expect((await rulesGET(req("notification-rules?productId=product&contextTeamId=foreign-team"))).status).toBe(404);
  });

  it("uses the same effective requirements in delivery and compliance, including disabled overrides", async () => {
    const root = await createRequirement(tenant);
    const override = await createRequirement(team, { overridesId: root, channelTypes: ["bark"], scopeType: "user", scopeUserId: "agent" });
    const response = await complianceGET(req("notification-compliance?productId=product&contextTeamId=team-a"));
    const result = z.object({ data: z.object({ requirements: z.array(z.object({ id: z.string(), channelTypes: z.array(z.string()), targetCount: z.number(), missing: z.array(z.object({ userId: z.string(), channelTypes: z.array(z.string()) })) })) }) }).parse(await response.json());
    expect(result.data.requirements).toEqual([{ id: override, channelTypes: ["bark"], targetCount: 1, missing: [{ userId: "agent", channelTypes: ["bark"] }] }]);
    await sendRecipientNotifications(db, { ticketId: "ticket", triggerEvent: "ticket_created" });
    expect((await db.select().from(notificationLogs))[0]).toMatchObject({ requirementId: override, channelType: "bark", status: "failed" });
    const mask = await createRequirement(product, { overridesId: root, contextTeamId: "team-a", enabled: false });
    const masked = await complianceGET(req("notification-compliance?productId=product&contextTeamId=team-a"));
    expect(z.object({ data: z.object({ requirements: z.array(z.unknown()) }) }).parse(await masked.json()).data.requirements).toHaveLength(0);
    expect((await requirementsDELETE(req(`notification-requirements/${mask}`, "DELETE"), params(mask))).status).toBe(200);
  });

  it("deduplicates endpoint deliveries across effective rules and requirements", async () => {
    await createRule(tenant);
    await createRule(team);
    await createRule(product);
    await createRequirement(tenant, { channelTypes: ["ntfy"], scopeType: "user", scopeUserId: "agent" });
    await sendRecipientNotifications(db, { ticketId: "ticket", triggerEvent: "ticket_created" });
    expect(send).toHaveBeenCalledOnce();
    expect(await db.select().from(notificationLogs)).toHaveLength(1);
  });

  it("limits a team's all-agent policies to that team in both product delivery and compliance", async () => {
    await createRule(team, { recipientType: "product_agents" });
    const required = await createRequirement(team, { channelTypes: ["ntfy"] });
    const response = await complianceGET(req("notification-compliance?productId=product&contextTeamId=team-a"));
    const result = z.object({ data: z.object({ requirements: z.array(z.object({ id: z.string(), targetCount: z.number() })) }) }).parse(await response.json());
    expect(result.data.requirements).toEqual([{ id: required, targetCount: 2 }]);
    await sendRecipientNotifications(db, { ticketId: "ticket", triggerEvent: "ticket_created" });
    expect(send).toHaveBeenCalledOnce();
    const logs = await db.select().from(notificationLogs);
    expect([...new Set(logs.map(log => log.recipientUserId))].sort()).toEqual(["agent", "team-admin"]);
  });

  it.each(["rule", "requirement"] as const)("preserves a team's all-agent audience when the product editor overrides its %s", async kind => {
    const root = kind === "rule" ? await createRule(team, { recipientType: "product_agents" }) : await createRequirement(team, { channelTypes: ["ntfy"] });
    const inherited = await loadEffectiveNotificationPolicies(db, product, "team-a");
    const target = kind === "rule" ? ruleTargetForScope(inherited.rules[0], "product") : requirementTargetForScope(inherited.requirements[0], "product");
    if (kind === "rule") await createRule(product, { overridesId: root, contextTeamId: "team-a", ...target });
    else await createRequirement(product, { overridesId: root, contextTeamId: "team-a", channelTypes: ["ntfy"], ...target });
    await sendRecipientNotifications(db, { ticketId: "ticket", triggerEvent: "ticket_created" });
    expect(send).toHaveBeenCalledOnce();
    const logs = await db.select().from(notificationLogs);
    expect([...new Set(logs.map(log => log.recipientUserId))].sort()).toEqual(["agent", "team-admin"]);
    const compliance = await complianceGET(req("notification-compliance?productId=product&contextTeamId=team-a"));
    const result = z.object({ data: z.object({ requirements: z.array(z.object({ targetCount: z.number() })) }) }).parse(await compliance.json());
    expect(result.data.requirements.map(row => row.targetCount)).toEqual(kind === "requirement" ? [2] : []);
  });

  it.each(["rule", "requirement"] as const)("can mask an inherited %s with an unavailable target without allowing new or enabled foreign targets", async kind => {
    const target = kind === "rule"
      ? { ...fields, recipientType: "team", recipientTeamId: "team-a" }
      : { name: "Required", scopeType: "team", scopeTeamId: "team-a", triggerEvents: ["ticket_created"], channelTypes: ["ntfy"] };
    const root = kind === "rule" ? await createRule(tenant, target) : await createRequirement(tenant, target);
    const post = kind === "rule" ? rulesPOST : requirementsPOST;
    const patch = kind === "rule" ? rulesPATCH : requirementsPATCH;
    const path = `notification-${kind}s`;
    const teamResponse = await post(req(path, "POST", { ...target, scope: "team", teamId: "team-b", overridesId: root, enabled: false }));
    expect(teamResponse.status).toBe(201);
    await db.delete(productTeams).where(eq(productTeams.teamId, "team-a"));
    actorId = "product-admin";
    const productResponse = await post(req(path, "POST", { ...target, ...product, contextTeamId: "team-b", overridesId: root, enabled: false }));
    expect(productResponse.status).toBe(201);
    const id = idResult.parse(await productResponse.json()).data.id;
    await db.update(tickets).set({ teamId: "team-b", assigneeId: "agent-b" }).where(eq(tickets.id, "ticket"));
    await sendRecipientNotifications(db, { ticketId: "ticket", triggerEvent: "ticket_created" });
    expect(send).not.toHaveBeenCalled();
    expect(await db.select().from(notificationLogs)).toHaveLength(0);
    expect((await patch(req(`${path}/${id}`, "PATCH", { enabled: true }), params(id))).status).toBe(400);
    const teamField = kind === "rule" ? "recipientTeamId" : "scopeTeamId";
    expect((await patch(req(`${path}/${id}`, "PATCH", { [teamField]: "foreign-team", enabled: false }), params(id))).status).toBe(400);
    expect((await post(req(path, "POST", { ...target, ...product, [teamField]: "foreign-team", enabled: false }))).status).toBe(400);
    expect((await patch(req(`${path}/${id}`, "PATCH", { [teamField]: "team-b", enabled: true }), params(id))).status).toBe(200);
  });

  it.each(["rule", "requirement"] as const)("can disable a stale local %s but cannot re-enable its inactive recipient", async kind => {
    const target = kind === "rule" ? { recipientType: "user", recipientUserId: "agent" } : { scopeType: "user", scopeUserId: "agent" };
    const id = kind === "rule" ? await createRule(product, target) : await createRequirement(product, target);
    await db.update(agents).set({ active: false }).where(eq(agents.userId, "agent"));
    const patch = kind === "rule" ? rulesPATCH : requirementsPATCH;
    const path = `notification-${kind}s/${id}`;
    expect((await patch(req(path, "PATCH", { enabled: false }), params(id))).status).toBe(200);
    expect((await patch(req(path, "PATCH", { enabled: true }), params(id))).status).toBe(400);
  });

  it("preserves scope authority and rejects parent writes, foreign associations and invalid lineage", async () => {
    const root = await createRule(tenant);
    actorId = "product-admin";
    expect((await rulesPATCH(req(`notification-rules/${root}`, "PATCH", { enabled: false }), params(root))).status).toBe(403);
    expect((await rulesPOST(req("notification-rules", "POST", { ...fields, ...team }))).status).toBe(403);
    await createRule({ scope: "team", teamId: "product-team" });
    await createRule(product, { overridesId: root });
    expect((await rulesPOST(req("notification-rules", "POST", { ...fields, ...product, recipientType: "team", recipientTeamId: "foreign-team" }))).status).toBe(400);
    expect((await rulesPOST(req("notification-rules", "POST", { ...fields, ...product, tenantId: "foreign" }))).status).toBe(400);
    actorId = "team-admin";
    await createRule(team);
    expect((await rulesGET(req("notification-rules?scope=team&teamId=team-b"))).status).toBe(404);
    expect((await rulesGET(req("notification-rules?scope=tenant&tenantId=tenant"))).status).toBe(403);
    expect((await rulesPOST(req("notification-rules", "POST", { ...fields, ...product }))).status).toBe(403);
    actorId = "agent";
    expect((await rulesGET(req("notification-rules?scope=team&teamId=team-a"))).status).toBe(403);
    actorId = "super";
    expect((await rulesPOST(req("notification-rules", "POST", { ...fields, ...product, overridesId: "missing" }))).status).toBe(400);
    expect((await rulesPOST(req("notification-rules", "POST", { ...fields, scope: "team", teamId: "system-team" }))).status).toBe(400);
  });

  it("prevents conflicting concurrent overrides and protects parents and owning teams from deletion", async () => {
    const root = await createRule(tenant);
    const requests = await Promise.all([1, 2].map(() => rulesPOST(req("notification-rules", "POST", { ...fields, ...team, overridesId: root }))));
    expect(requests.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await rulesDELETE(req(`notification-rules/${root}`, "DELETE"), params(root))).status).toBe(409);
    const detached = await createRule({ scope: "team", teamId: "product-team" });
    expect((await teamDELETE(req("teams/product-team", "DELETE"), params("product-team"))).status).toBe(409);
    expect((await rulesDELETE(req(`notification-rules/${detached}`, "DELETE"), params(detached))).status).toBe(200);
  });

  it("keeps old product API-key grants from gaining tenant/team authority", async () => {
    await db.insert(user).values({ id: "super", name: "Super", email: "super@example.test", createdAt: new Date(), updatedAt: new Date() });
    async function key(permissions: string[]) {
      const generated = await generateAccountApiKey();
      await db.insert(accountApiKeys).values({ id: generated.id, userId: "super", name: "Fixture", secretHash: generated.secretHash, permissions, resourceMode: "all", productIds: [], createdAt: NOW(), expiresAt: new Date(Date.now() + 86400000).toISOString() });
      return { authorization: `Bearer ${generated.plaintext}` };
    }
    const old = await key(["create_notification_rule", "list_notification_rules"]);
    actorId = null;
    expect((await rulesPOST(req("notification-rules", "POST", { ...fields, ...tenant }, old))).status).toBe(403);
    expect((await rulesGET(req("notification-rules?scope=team&teamId=team-a", "GET", undefined, old))).status).toBe(403);
    expect((await rulesPOST(req("notification-rules", "POST", { ...fields, ...product }, old))).status).toBe(201);
    const scoped = await key(["team_create_notification_rule"]);
    expect((await rulesPOST(req("notification-rules", "POST", { ...fields, ...team }, scoped))).status).toBe(201);
    expect((await rulesPOST(req("notification-rules", "POST", { ...fields, ...tenant }, scoped))).status).toBe(403);
  });

  it.each(["rule", "requirement"] as const)("rejects a %s override when its parent is concurrently deleted", async kind => {
    const root = kind === "rule" ? await createRule(tenant) : await createRequirement(tenant);
    const original = overrideValidation.validateNotificationOverride;
    let validated!: () => void;
    let resume!: () => void;
    const ready = new Promise<void>(resolve => { validated = resolve; });
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const spy = vi.spyOn(overrideValidation, "validateNotificationOverride").mockImplementation(async (...args) => {
      const result = await original(...args);
      validated();
      await gate;
      return result;
    });
    try {
      const body = kind === "rule" ? fields : { name: "Required", scopeType: "product", triggerEvents: ["ticket_created"], channelTypes: ["ntfy"] };
      const pending = (kind === "rule" ? rulesPOST : requirementsPOST)(req(`notification-${kind}s`, "POST", { ...body, ...team, overridesId: root }));
      await ready;
      const deleted = await (kind === "rule" ? rulesDELETE : requirementsDELETE)(req(`notification-${kind}s/${root}`, "DELETE"), params(root));
      expect(deleted.status).toBe(200);
      resume();
      expect((await pending).status).toBe(409);
      const policies = await loadEffectiveNotificationPolicies(db, team);
      expect(policies.rules).toHaveLength(0);
      expect(policies.requirements).toHaveLength(0);
    } finally {
      resume();
      spy.mockRestore();
    }
  });

  it("does not deliver to a former product member and keeps preview writes blocked", async () => {
    await createRule(tenant);
    await db.delete(agentTeams).where(eq(agentTeams.userId, "agent"));
    await sendRecipientNotifications(db, { ticketId: "ticket", triggerEvent: "ticket_created" });
    expect(send).not.toHaveBeenCalled();
    const preview = await sealPreviewCookie({ actorId: "super", targetUserId: "tenant-admin", exp: Date.now() + 60_000 }, secret);
    expect((await rulesPOST(req("notification-rules", "POST", { ...fields, ...tenant }, { cookie: `${PREVIEW_COOKIE_NAME}=${preview}` }))).status).toBe(403);
  });
});

describe("notification inheritance migration", () => {
  it("preserves non-empty legacy product rules and requirements exactly", async () => {
    const client = createClient({ url: ":memory:" });
    const dir = join(__dirname, "../../drizzle/migrations");
    const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
    const apply = async (file: string) => { for (const statement of readFileSync(join(dir, file), "utf8").split("--> statement-breakpoint")) { if (statement.trim()) await client.execute(statement); } };
    try {
      for (const file of files.filter(f => !f.startsWith("0032_"))) await apply(file);
      await client.execute("INSERT INTO notification_rules (id, product_id, name, enabled, trigger_events, channel_types, recipient_type, created_at, updated_at) VALUES ('legacy', 'product', 'Legacy', 0, '[\"ticket_created\"]', '[\"email\"]', 'assignee', 'before', 'before')");
      await client.execute("INSERT INTO notification_requirements (id, product_id, name, enabled, scope_type, trigger_events, channel_types, created_at, updated_at) VALUES ('required', 'product', 'Required', 1, 'product', '[\"ticket_created\"]', '[\"email\"]', 'before', 'before')");
      const before = await client.execute("SELECT * FROM notification_rules");
      await apply(files.find(f => f.startsWith("0032_"))!);
      const after = await client.execute("SELECT * FROM notification_rules");
      expect(after.rows[0]).toMatchObject(before.rows[0]);
      expect(after.rows[0]).toMatchObject({ scope: "product", overrides_id: null, tenant_id: null, team_id: null });
      expect((await client.execute("SELECT * FROM notification_requirements")).rows[0]).toMatchObject({ id: "required", product_id: "product", enabled: 1, scope: "product", overrides_id: null });
    } finally { client.close(); }
  });
});
