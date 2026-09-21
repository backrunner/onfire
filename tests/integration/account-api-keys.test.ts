import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { NextRequest } from "next/server";
import {
  accountApiKeys,
  agentTeams,
  agents,
  customers,
  emailConfigs,
  products,
  productTeams,
  rateLimits,
  teams,
  tenants,
  tickets,
  user,
  userProducts,
  users,
} from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { Role, TicketPriority, TicketStatus } from "@/lib/types";
import {
  POST as createKey,
  GET as listKeys,
} from "@/app/api/tob/api-keys/route";
import {
  PATCH as editKey,
  DELETE as revokeKey,
} from "@/app/api/tob/api-keys/[id]/route";
import { GET as discovery } from "@/app/api/tob/api-key/route";
import { GET as listTickets } from "@/app/api/tob/tickets/route";
import { POST as reply } from "@/app/api/tob/tickets/[id]/route";
import { POST as assign } from "@/app/api/tob/tickets/[id]/assign/route";
import {
  GET as listProducts,
  POST as createProduct,
} from "@/app/api/tob/admin/products/route";
import { PATCH as updateProduct } from "@/app/api/tob/admin/products/[id]/route";
import { GET as listTeams } from "@/app/api/tob/meta/teams/route";
import { GET as listCustomers } from "@/app/api/tob/admin/customers/route";
import { GET as listAiCredentials } from "@/app/api/tob/admin/ai/credentials/route";
import { resolveAuthedContext, withAuth } from "@/lib/api/handler";
import { authorizeApiKeyRequest, verifyAccountApiKey } from "@/lib/api-keys/auth";
import { ok } from "@/lib/api/response";
import {
  apiKeyOperations,
  describeApiKeyOperation,
  matchingApiKeyOperations,
} from "@/lib/api-keys/catalog";
import { deleteManagedAuthUser } from "@/lib/auth/managed-user";
import { sealPreviewCookie, PREVIEW_COOKIE_NAME } from "@/lib/preview-identity";
import { createTestDb } from "./test-db";
import { POST as createProductKey } from "@/app/api/tob/admin/product-keys/route";
import { PATCH as editProductKey } from "@/app/api/tob/admin/product-keys/[id]/route";
import { POST as rotateProductKey } from "@/app/api/tob/admin/product-keys/[id]/rotate/route";
import { productKeys } from "@/drizzle/schema";
import { verifyProductApiKey } from "@/lib/auth/api-key";
import { POST as updateStatus } from "@/app/api/tob/tickets/[id]/status/route";
import { POST as bulkStatus } from "@/app/api/tob/tickets/bulk/status/route";
import { POST as bulkAssign } from "@/app/api/tob/tickets/bulk/assign/route";
import { emitTicketEvent } from "@/services/ticket-events";

let db: Database;
let sessionUserId: string | null;
const getSession = vi.fn(async () =>
  sessionUserId ? { user: { id: sessionUserId } } : null,
);
const origin = "https://admin.example.com";
const secret = "api-key-test-preview-secret";
vi.mock("@/lib/db", async (original) => ({
  ...(await original<typeof import("@/lib/db")>()),
  getDb: () => db,
  getEnv: () => ({
    BETTER_AUTH_URL: origin, AUTH_SECRET: secret,
    EMAIL_AGENT_ADDRESSES: "support@example.test",
    EMAIL_AGENT_PRODUCTS: { "support@example.test": "p1" },
  }),
}));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock("@/services/ticket-events", () => ({ emitTicketEvent: vi.fn() }));

const ticketResult = z.object({
  data: z.object({ items: z.array(z.object({ id: z.string() })) }),
});
const listResult = z.object({ data: z.array(z.object({ id: z.string() })) });
const future = () => new Date(Date.now() + 86400000).toISOString();
const params = (id: string) => ({ params: Promise.resolve({ id }) });
function req(
  path: string,
  method = "GET",
  token?: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new NextRequest(`${origin}/api/tob/${path}`, {
    method,
    headers: {
      origin,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function input(permissions = ["list_tickets"], selected = false) {
  return {
    name: "Automation",
    permissions,
    resourceMode: selected ? "products" : "all",
    productIds: selected ? ["p1"] : [],
    expiresAt: future(),
  };
}
async function mint(permissions = ["list_tickets"], selected = false) {
  const response = await createKey(
    req("api-keys", "POST", undefined, input(permissions, selected)),
  );
  expect(response.status).toBe(201);
  return z
    .object({
      data: z.object({
        id: z.string(),
        apiKey: z.string(),
        expiresAt: z.string(),
      }),
    })
    .parse(await response.json()).data;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  db = await createTestDb();
  sessionUserId = "admin";
  await db.insert(tenants).values([
    { id: "t1", name: "One" },
    { id: "t2", name: "Two" },
  ]);
  await db.insert(products).values([
    { id: "p1", tenantId: "t1", name: "One" },
    { id: "p2", tenantId: "t1", name: "Two" },
    { id: "p3", tenantId: "t2", name: "Foreign" },
  ]);
  for (const [id, role] of [
    ["admin", Role.SuperAdmin],
    ["tenant", Role.TenantAdmin],
    ["product", Role.ProductAdmin],
    ["agent", Role.Agent],
  ] as const) {
    await db
      .insert(user)
      .values({
        id,
        name: id,
        email: `${id}@example.test`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    await db
      .insert(users)
      .values({
        id,
        displayName: id,
        email: `${id}@example.test`,
        tenantId: "t1",
        role,
      });
  }
  await db.insert(userProducts).values({ userId: "product", productId: "p1" });
  await db.insert(teams).values([
    { id: "team1", tenantId: "t1", name: "One" },
    { id: "team2", tenantId: "t1", name: "Two" },
  ]);
  await db.insert(productTeams).values([
    { productId: "p1", teamId: "team1" },
    { productId: "p2", teamId: "team2" },
  ]);
  await db.insert(agentTeams).values([
    { userId: "agent", teamId: "team1" },
    { userId: "admin", teamId: "team1" },
  ]);
  await db.insert(agents).values([
    { userId: "admin", level: 2, active: true },
    { userId: "agent", level: 1, active: true },
  ]);
  for (const [id, productId, tenantId, teamId] of [
    ["one", "p1", "t1", "team1"],
    ["two", "p2", "t1", "team2"],
    ["foreign", "p3", "t2", "team3"],
  ]) {
    await db
      .insert(tickets)
      .values({
        id,
        productId,
        tenantId,
        teamId,
        subject: id,
        content: "body",
        status: TicketStatus.New,
        priority: TicketPriority.Medium,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    await db
      .insert(customers)
      .values({
        id,
        productId,
        tenantId,
        email: `${id}@example.test`,
        createdAt: future(),
        updatedAt: future(),
      });
  }
});

describe("account API credentials through real handlers and migrated SQLite", () => {
  it.each([false, true])("commits a public reply, history and mail intent together; stale=%s", async (stale) => {
    const key = await mint(["reply_ticket"]);
    await db.insert(emailConfigs).values({
      id: "mail", productId: "p1", outboundEnabled: true,
      outboundProvider: "cloudflare", outboundSenderEmail: "support@example.test",
      createdAt: future(), updatedAt: future(),
    });
    if (stale) {
      const snapshot = (await db.query.tickets.findFirst({ where: eq(tickets.id, "one") }))!;
      await db.update(tickets).set({ status: TicketStatus.Closed }).where(eq(tickets.id, "one"));
      vi.spyOn(db.query.tickets, "findFirst").mockResolvedValueOnce(snapshot);
    }
    const response = await reply(req("tickets/one", "POST", key.apiKey, { content: "Public answer" }), params("one"));
    expect(response.status, await response.text()).toBe(stale ? 409 : 200);
    expect(await db.query.replies.findMany()).toHaveLength(stale ? 0 : 1);
    expect(await db.query.history.findMany()).toHaveLength(stale ? 0 : 1);
    expect(await db.query.emailReplyIntents.findMany()).toHaveLength(stale ? 0 : 1);
    expect(emitTicketEvent).toHaveBeenCalledTimes(stale ? 0 : 1);
    expect((await db.query.tickets.findFirst({ where: eq(tickets.id, "one") }))?.status)
      .toBe(stale ? TicketStatus.Closed : TicketStatus.Replied);
  });
  it.each(["revoked", "scope", "permissions", "expired", "deleted"])(
    "rejects a credential %s during identity resolution before entering the handler",
    async (change) => {
      const key = await mint(["list_products"]);
      const request = req("admin/products", "GET", key.apiKey);
      const verified = await verifyAccountApiKey(db, request);
      const ctx = (await resolveAuthedContext(db, "admin", {}))!;
      if (change === "deleted") {
        await db.delete(accountApiKeys).where(eq(accountApiKeys.id, key.id));
      } else {
        await db.update(accountApiKeys).set(
          change === "revoked" ? { revokedAt: new Date().toISOString() }
            : change === "scope" ? { resourceMode: "products", productIds: ["p1"] }
              : change === "permissions" ? { permissions: ["list_tickets"] }
                : { expiresAt: new Date().toISOString() },
        ).where(eq(accountApiKeys.id, key.id));
      }
      await expect(authorizeApiKeyRequest(request, ctx, verified)).rejects.toMatchObject({ status: 401 });
      expect((await db.query.accountApiKeys.findFirst())?.lastUsedAt ?? null).toBeNull();
    },
  );

  it("cannot overwrite a concurrent account-key permission reduction", async () => {
    const key = await mint(["list_products", "list_tickets"]);
    const snapshot = (await db.query.accountApiKeys.findFirst())!;
    await db.update(accountApiKeys).set({ permissions: ["list_tickets"] }).where(eq(accountApiKeys.id, key.id));
    // Model another editor committing after this request read its snapshot.
    vi.spyOn(db.query.accountApiKeys, "findFirst").mockResolvedValueOnce(snapshot);
    const result = await editKey(req(`api-keys/${key.id}`, "PATCH", undefined, {
      ...input(snapshot.permissions), expiresAt: snapshot.expiresAt,
    }), params(key.id));
    expect(result.status).toBe(409);
    expect((await db.query.accountApiKeys.findFirst())?.permissions).toEqual(["list_tickets"]);
  });

  it("requires reassignment authority for assigned rows in a bulk request", async () => {
    const key = await mint(["bulk_assign_tickets"]);
    await db.update(tickets).set({ assigneeId: "agent", status: TicketStatus.Processing }).where(eq(tickets.id, "one"));
    const response = await bulkAssign(req("tickets/bulk/assign", "POST", key.apiKey, {
      ticketIds: ["one"], assigneeId: "admin",
    }));
    expect(await response.json()).toMatchObject({ data: { succeeded: 0, failed: 1 } });
    expect((await db.query.tickets.findFirst({ where: eq(tickets.id, "one") }))?.assigneeId).toBe("agent");
    expect(await db.query.history.findMany()).toEqual([]);
    const allowed = await mint(["bulk_assign_tickets", "reassign_ticket"]);
    expect(await (await bulkAssign(req("tickets/bulk/assign", "POST", allowed.apiKey, {
      ticketIds: ["one"], assigneeId: "admin",
    }))).json()).toMatchObject({ data: { succeeded: 1, failed: 0 } });
  });

  it.each(["assign", "status"])("does not bypass a branch permission using stale ticket state: %s", async (action) => {
    const key = await mint([action === "assign" ? "assign_ticket" : "update_ticket_status"]);
    const snapshot = (await db.query.tickets.findFirst({ where: eq(tickets.id, "one") }))!;
    await db.update(tickets).set(action === "assign"
      ? { assigneeId: "agent", status: TicketStatus.Processing }
      : { status: TicketStatus.Closed }).where(eq(tickets.id, "one"));
    vi.spyOn(db.query.tickets, "findFirst").mockResolvedValueOnce(snapshot);
    const handler = action === "assign" ? assign : updateStatus;
    const result = await handler(req(`tickets/one/${action}`, "POST", key.apiKey,
      action === "assign" ? { assigneeId: "admin" } : { status: "processing" }), params("one"));
    expect(result.status, await result.text()).toBe(409);
    expect(await db.query.history.findMany()).toEqual([]);
    const current = (await db.query.tickets.findFirst({ where: eq(tickets.id, "one") }))!;
    if (action === "assign") expect(current.assigneeId).toBe("agent");
    else expect(current.status).toBe(TicketStatus.Closed);
  });

  it.each(["shorten", "revoke", "rotate", "delete"])("product-key writes reject a concurrent %s", async (change) => {
    const result = await createProductKey(req("admin/product-keys", "POST", undefined, { productId: "p1" }));
    const { data: created } = z.object({ data: z.object({ id: z.string() }) }).parse(await result.json());
    const snapshot = (await db.query.productKeys.findFirst())!;
    const shorter = future();
    if (change === "delete") await db.delete(productKeys).where(eq(productKeys.id, created.id));
    else await db.update(productKeys).set(change === "shorten" ? { expiresAt: shorter }
      : change === "revoke" ? { revoked: true } : { secretHash: "a".repeat(64) }).where(eq(productKeys.id, created.id));
    vi.spyOn(db.query.productKeys, "findFirst").mockResolvedValueOnce(snapshot);
    const response = change === "shorten"
      ? await editProductKey(req(`admin/product-keys/${created.id}`, "PATCH", undefined, {
        expiresAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      }), params(created.id))
      : await rotateProductKey(req(`admin/product-keys/${created.id}/rotate`, "POST"), params(created.id));
    expect(response.status, await response.text()).toBe(409);
    if (change === "shorten") expect((await db.query.productKeys.findFirst())?.expiresAt).toBe(shorter);
  });
  it("stores hashes only; listing/discovery never expose secrets; native bearer works without a session", async () => {
    const key = await mint();
    const row = await db.query.accountApiKeys.findFirst();
    expect(row?.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(row)).not.toContain(key.apiKey.split(".")[1]);
    const listing = await listKeys(req("api-keys"));
    expect(await listing.text()).not.toContain("secretHash");
    expect(listing.headers.get("cache-control")).toBe("no-store");
    sessionUserId = null;
    getSession.mockClear();
    const response = await discovery(req("api-key", "GET", key.apiKey));
    const body = z
      .object({
        data: z.object({ operations: z.array(z.object({ id: z.string() })) }),
      })
      .parse(await response.json());
    expect(response.status).toBe(200);
    expect(body.data.operations.map((op: { id: string }) => op.id)).toEqual([
      "list_tickets",
    ]);
    expect(JSON.stringify(body)).not.toContain(key.apiKey);
    expect(getSession).not.toHaveBeenCalled();
    const native = req("tickets", "GET", key.apiKey);
    native.headers.delete("origin");
    expect((await listTickets(native)).status).toBe(200);
  });

  it("applies product selection to ticket, product, customer and team lists and mutations", async () => {
    const key = await mint(
      [
        "list_tickets",
        "list_products",
        "list_customers",
        "list_visible_teams",
        "update_product",
      ],
      true,
    );
    const ticketList = ticketResult.parse(
      await (await listTickets(req("tickets", "GET", key.apiKey))).json(),
    );
    expect(ticketList.data.items.map((t: { id: string }) => t.id)).toEqual([
      "one",
    ]);
    expect(
      listResult
        .parse(
          await (
            await listProducts(req("admin/products", "GET", key.apiKey))
          ).json(),
        )
        .data.map((p: { id: string }) => p.id),
    ).toEqual(["p1"]);
    expect(
      ticketResult
        .parse(
          await (
            await listCustomers(req("admin/customers", "GET", key.apiKey))
          ).json(),
        )
        .data.items.map((c: { id: string }) => c.id),
    ).toEqual(["one"]);
    expect(
      listResult
        .parse(
          await (await listTeams(req("meta/teams", "GET", key.apiKey))).json(),
        )
        .data.map((t: { id: string }) => t.id),
    ).toEqual(["team1"]);
    expect(
      (
        await updateProduct(
          req("admin/products/p2", "PATCH", key.apiKey, { name: "Denied" }),
          params("p2"),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await updateProduct(
          req("admin/products/p1", "PATCH", key.apiKey, { name: "Updated" }),
          params("p1"),
        )
      ).status,
    ).toBe(200);
    expect(
      (await db.query.products.findFirst({ where: eq(products.id, "p1") }))
        ?.name,
    ).toBe("Updated");
  });

  it("does not let read grants write or fall back to a privileged browser cookie", async () => {
    const key = await mint(["list_products"]);
    expect(
      (
        await createProduct(
          req("admin/products", "POST", key.apiKey, { name: "Denied" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await listProducts(req("admin/products", "GET", `${key.apiKey}x`)))
        .status,
    ).toBe(401);
    expect(
      (
        await listProducts(
          req("admin/products", "GET", "some-product-key.secret"),
        )
      ).status,
    ).toBe(401);
  });

  it("rechecks live role, tenant, product and team membership", async () => {
    const key = await mint(["list_tickets", "list_products", "create_product"]);
    await db
      .update(users)
      .set({ role: Role.ProductAdmin })
      .where(eq(users.id, "admin"));
    await db.insert(userProducts).values({ userId: "admin", productId: "p1" });
    expect(
      (
        await createProduct(
          req("admin/products", "POST", key.apiKey, { name: "Denied" }),
        )
      ).status,
    ).toBe(403);
    expect(
      ticketResult.parse(
        await (await listTickets(req("tickets", "GET", key.apiKey))).json(),
      ).data.items,
    ).toHaveLength(1);
    await db.delete(userProducts).where(eq(userProducts.userId, "admin"));
    expect(
      ticketResult.parse(
        await (await listTickets(req("tickets", "GET", key.apiKey))).json(),
      ).data.items,
    ).toEqual([]);
    await db
      .update(users)
      .set({ role: Role.Agent })
      .where(eq(users.id, "admin"));
    expect(
      ticketResult.parse(
        await (await listTickets(req("tickets", "GET", key.apiKey))).json(),
      ).data.items,
    ).toHaveLength(1);
    await db.delete(agentTeams).where(eq(agentTeams.userId, "admin"));
    expect(
      ticketResult.parse(
        await (await listTickets(req("tickets", "GET", key.apiKey))).json(),
      ).data.items,
    ).toEqual([]);
    await db.delete(users).where(eq(users.id, "admin"));
    expect((await discovery(req("api-key", "GET", key.apiKey))).status).toBe(
      401,
    );
  });

  it("separates public replies from internal notes on their shared endpoint", async () => {
    const key = await mint(["add_ticket_note"]);
    expect(
      (
        await reply(
          req("tickets/one", "POST", key.apiKey, {
            content: "private",
            internal: false,
          }),
          params("one"),
        )
      ).status,
    ).toBe(403);
    expect(await db.query.replies.findMany()).toEqual([]);
    expect(
      (
        await reply(
          req("tickets/one", "POST", key.apiKey, {
            content: "private",
            internal: true,
          }),
          params("one"),
        )
      ).status,
    ).toBe(200);
    expect((await db.query.replies.findMany()).map((r) => r.internal)).toEqual([
      true,
    ]);
    const publicKey = await mint(["reply_ticket"]);
    expect(
      (
        await reply(
          req("tickets/one", "POST", publicKey.apiKey, {
            content: "private",
            internal: true,
          }),
          params("one"),
        )
      ).status,
    ).toBe(403);
  });

  it("separates initial assignment and reassignment, including agent team policy", async () => {
    const key = await mint(["assign_ticket"]);
    expect(
      matchingApiKeyOperations("POST", "/api/tob/tickets/one/assign", {
        id: "one",
      }).map((op) => op.id),
    ).toContain("assign_ticket");
    expect(
      (await db.query.tickets.findFirst({ where: eq(tickets.id, "one") }))
        ?.assigneeId,
    ).toBeNull();
    const firstAssignment = await assign(
      req("tickets/one/assign", "POST", key.apiKey, { assigneeId: "admin" }),
      params("one"),
    );
    expect(firstAssignment.status, await firstAssignment.text()).toBe(200);
    expect(
      (
        await assign(
          req("tickets/one/assign", "POST", key.apiKey, {
            assigneeId: "agent",
          }),
          params("one"),
        )
      ).status,
    ).toBe(403);
    sessionUserId = "agent";
    const reassignKey = await mint(["reassign_ticket"]);
    expect(
      (
        await assign(
          req("tickets/one/assign", "POST", reassignKey.apiKey, {
            assigneeId: "agent",
          }),
          params("one"),
        )
      ).status,
    ).toBe(200);
    await db
      .update(teams)
      .set({ allowReassign: false })
      .where(eq(teams.id, "team1"));
    expect(
      (
        await assign(
          req("tickets/one/assign", "POST", reassignKey.apiKey, {
            assigneeId: "admin",
          }),
          params("one"),
        )
      ).status,
    ).toBe(403);
  });

  it.each([
    "2000-01-01T00:00:00Z",
    "invalid",
    new Date(Date.now() + 366 * 86400000).toISOString(),
  ])("rejects invalid expiry %s", async (expiresAt) => {
    expect(
      (
        await createKey(
          req("api-keys", "POST", undefined, { ...input(), expiresAt }),
        )
      ).status,
    ).toBe(400);
    expect(await db.query.accountApiKeys.findMany()).toEqual([]);
  });

  it("expires, revokes irreversibly, and removes credentials with the account", async () => {
    const expired = await mint();
    await db
      .update(accountApiKeys)
      .set({ expiresAt: new Date().toISOString() })
      .where(eq(accountApiKeys.id, expired.id));
    expect(
      (await discovery(req("api-key", "GET", expired.apiKey))).status,
    ).toBe(401);
    expect(
      (
        await editKey(
          req(`api-keys/${expired.id}`, "PATCH", undefined, input()),
          params(expired.id),
        )
      ).status,
    ).toBe(400);
    const key = await mint();
    expect(
      (await revokeKey(req(`api-keys/${key.id}`, "DELETE"), params(key.id)))
        .status,
    ).toBe(200);
    expect((await discovery(req("api-key", "GET", key.apiKey))).status).toBe(
      401,
    );
    expect(
      (
        await editKey(
          req(`api-keys/${key.id}`, "PATCH", undefined, input()),
          params(key.id),
        )
      ).status,
    ).toBe(400);
    await deleteManagedAuthUser(db, "admin");
    expect(await db.query.accountApiKeys.findMany()).toEqual([]);
  });

  it("limits grant creation to live role and selected resources", async () => {
    sessionUserId = "product";
    for (const body of [
      input(["create_product"]),
      { ...input(["list_tickets"], true), productIds: ["p2"] },
      { ...input(["list_ai_credentials"], true) },
      { ...input(), permissions: ["*"] },
      { ...input(), resourceMode: "products" },
    ]) {
      expect(
        (await createKey(req("api-keys", "POST", undefined, body))).status,
      ).toBeGreaterThanOrEqual(400);
    }
    const key = await mint();
    expect(
      (
        await listAiCredentials(
          req("admin/ai/credentials?scope=system", "GET", key.apiKey),
        )
      ).status,
    ).toBe(403);
  });

  it("blocks key management, security/unknown endpoints, origin spoofing and foreign ownership", async () => {
    const key = await mint();
    expect((await listKeys(req("api-keys", "GET", key.apiKey))).status).toBe(
      403,
    );
    expect(
      (await createKey(req("api-keys", "POST", key.apiKey, input()))).status,
    ).toBe(403);
    const endpoint = withAuth({}, async () => ok({ leaked: true }));
    for (const path of [
      "me",
      "preview",
      "oauth/grants",
      "new-route",
      "tickets%2fone",
    ])
      expect((await endpoint(req(path, "GET", key.apiKey))).status).toBe(403);
    expect(
      (
        await discovery(
          req("api-key", "GET", key.apiKey, undefined, {
            origin: "https://attacker.test",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createKey(
          req("api-keys", "POST", undefined, input(), {
            origin: "https://attacker.test",
          }),
        )
      ).status,
    ).toBe(403);
    sessionUserId = "tenant";
    expect(
      (await revokeKey(req(`api-keys/${key.id}`, "DELETE"), params(key.id)))
        .status,
    ).toBe(404);
    expect(
      (
        await editKey(
          req(`api-keys/${key.id}`, "PATCH", undefined, input()),
          params(key.id),
        )
      ).status,
    ).toBe(404);
  });

  it("blocks preview management and reflects edits on the very next call", async () => {
    const key = await mint(["list_products"]);
    const cookie = `${PREVIEW_COOKIE_NAME}=${await sealPreviewCookie({ actorId: "admin", targetUserId: "product", exp: Date.now() + 60000 }, secret)}`;
    expect(
      (await listKeys(req("api-keys", "GET", undefined, undefined, { cookie })))
        .status,
    ).toBe(403);
    const edited = {
      ...input(["list_tickets"], true),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
    expect(
      (
        await editKey(
          req(`api-keys/${key.id}`, "PATCH", undefined, edited),
          params(key.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (await listProducts(req("admin/products", "GET", key.apiKey))).status,
    ).toBe(403);
    expect(
      ticketResult.parse(
        await (await listTickets(req("tickets", "GET", key.apiKey))).json(),
      ).data.items,
    ).toHaveLength(1);
    expect(
      (
        await editKey(
          req(`api-keys/${key.id}`, "PATCH", undefined, input()),
          params(key.id),
        )
      ).status,
    ).toBe(400);
  });

  it("fails closed for corrupt grants and enforces rate limits with retry headers", async () => {
    const key = await mint();
    await db
      .insert(rateLimits)
      .values({
        key: `account-api-key:key:${key.id}`,
        count: 120,
        resetAt: Date.now() + 60000,
      });
    const limited = await discovery(req("api-key", "GET", key.apiKey));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(limited.headers.get("cache-control")).toBe("no-store");
    await db.delete(rateLimits);
    await db
      .update(accountApiKeys)
      .set({ resourceMode: "products", productIds: [] })
      .where(eq(accountApiKeys.id, key.id));
    expect((await discovery(req("api-key", "GET", key.apiKey))).status).toBe(
      401,
    );
    const insert = vi.spyOn(db, "insert").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect((await discovery(req("api-key", "GET", key.apiKey))).status).toBe(
      503,
    );
    insert.mockRestore();
  });

  it("serializes every effective operation's discoverable input contract", () => {
    expect(new Set(apiKeyOperations.map((op) => op.id)).size).toBe(
      apiKeyOperations.length,
    );
    for (const op of apiKeyOperations)
      expect(describeApiKeyOperation(op).inputSchema.type).toBe("object");
  });

  it("does not authorize a static route through a dynamic record grant", async () => {
    const key = await mint(["get_knowledge"]);
    const handler = vi.fn(async () => ok({ leaked: true }));
    const route = withAuth({ permission: "ai.knowledge" }, handler);
    expect(
      (await route(req("admin/ai/knowledge/reindex", "GET", key.apiKey)))
        .status,
    ).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("cannot bypass the reopen grant through single or bulk status changes", async () => {
    const key = await mint([
      "update_ticket_status",
      "bulk_update_ticket_status",
    ]);
    await db
      .update(tickets)
      .set({ status: TicketStatus.Closed })
      .where(eq(tickets.id, "one"));
    expect(
      (
        await updateStatus(
          req("tickets/one/status", "POST", key.apiKey, {
            status: "processing",
          }),
          params("one"),
        )
      ).status,
    ).toBe(403);
    const response = await bulkStatus(
      req("tickets/bulk/status", "POST", key.apiKey, {
        ticketIds: ["one"],
        status: "processing",
      }),
    );
    const result = z
      .object({ data: z.object({ succeeded: z.number(), failed: z.number() }) })
      .parse(await response.json());
    expect(result.data).toEqual({ succeeded: 0, failed: 1 });
    expect(
      (await db.query.tickets.findFirst({ where: eq(tickets.id, "one") }))
        ?.status,
    ).toBe(TicketStatus.Closed);
    const authorized = await mint(["update_ticket_status", "reopen_ticket"]);
    expect(
      (
        await updateStatus(
          req("tickets/one/status", "POST", authorized.apiKey, {
            status: "processing",
          }),
          params("one"),
        )
      ).status,
    ).toBe(200);
  });

  it("expires product token-issuance keys and preserves expiry across rotation", async () => {
    const result = await createProductKey(
      req("admin/product-keys", "POST", undefined, { productId: "p1" }),
    );
    expect(result.status).toBe(201);
    const key = z
      .object({
        data: z.object({
          id: z.string(),
          apiKey: z.string(),
          expiresAt: z.string(),
        }),
      })
      .parse(await result.json()).data;
    expect(Date.parse(key.expiresAt) - Date.now()).toBeGreaterThan(
      89 * 86400000,
    );
    expect(Date.parse(key.expiresAt) - Date.now()).toBeLessThanOrEqual(
      90 * 86400000,
    );
    expect(await verifyProductApiKey(db, key.apiKey)).toMatchObject({
      productId: "p1",
    });
    const rotated = await rotateProductKey(
      req(`admin/product-keys/${key.id}/rotate`, "POST"),
      params(key.id),
    );
    const next = z
      .object({ data: z.object({ apiKey: z.string(), expiresAt: z.string() }) })
      .parse(await rotated.json()).data;
    expect(next.expiresAt).toBe(key.expiresAt);
    expect(await verifyProductApiKey(db, key.apiKey)).toBeNull();
    expect(await verifyProductApiKey(db, next.apiKey)).toMatchObject({
      id: key.id,
    });
    await db
      .update(productKeys)
      .set({ expiresAt: new Date().toISOString() })
      .where(eq(productKeys.id, key.id));
    expect(await verifyProductApiKey(db, next.apiKey)).toBeNull();
    expect(
      (
        await rotateProductKey(
          req(`admin/product-keys/${key.id}/rotate`, "POST"),
          params(key.id),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await editProductKey(
          req(`admin/product-keys/${key.id}`, "PATCH", undefined, {
            expiresAt: future(),
          }),
          params(key.id),
        )
      ).status,
    ).toBe(400);
  });

  it("validates product key expiry at creation and disallows restoring revoked secrets", async () => {
    expect(
      (
        await createProductKey(
          req("admin/product-keys", "POST", undefined, {
            productId: "p1",
            expiresAt: "2000-01-01T00:00:00Z",
          }),
        )
      ).status,
    ).toBe(400);
    const created = await createProductKey(
      req("admin/product-keys", "POST", undefined, {
        productId: "p1",
        expiresAt: future(),
      }),
    );
    const key = z
      .object({ data: z.object({ id: z.string(), apiKey: z.string() }) })
      .parse(await created.json()).data;
    expect(
      (
        await editProductKey(
          req(`admin/product-keys/${key.id}`, "PATCH", undefined, {
            revoked: true,
          }),
          params(key.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await editProductKey(
          req(`admin/product-keys/${key.id}`, "PATCH", undefined, {
            revoked: false,
          }),
          params(key.id),
        )
      ).status,
    ).toBe(400);
    expect(await verifyProductApiKey(db, key.apiKey)).toBeNull();
  });
});
