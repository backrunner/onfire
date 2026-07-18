import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import type { AuthedContext } from "@/lib/api/handler";
import { assertTenantAccess } from "@/lib/api/scope";
import { Role, TicketPriority, TicketStatus } from "@/lib/types";
import {
  history,
  products,
  tenants,
  ticketInternalStateValues,
  ticketTypeInternalStates,
  ticketTypePresets,
  ticketTypes,
  tickets,
} from "@/drizzle/schema";
import {
  copyPresetToProduct,
  listTenantPresets,
  movePreset,
} from "@/services/ticket-type-presets";
import {
  normalizeStateOptions,
  setTicketInternalStateValue,
} from "@/services/ticket-internal-states";
import { createTestDb, NOW, uid } from "./test-db";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

describe("tenant ticket-type presets", () => {
  it("rejects cross-tenant preset scope while preserving SuperAdmin access", async () => {
    const tenantId = uid("tenant");
    const otherTenantId = uid("tenant");
    await db.insert(tenants).values([
      { id: tenantId, name: tenantId },
      { id: otherTenantId, name: otherTenantId },
    ]);
    const scoped = {
      db,
      role: Role.TenantAdmin,
      isSuperAdmin: false,
      tenantIds: [tenantId],
      teamIds: [],
      productIds: [],
      params: {},
      user: {
        id: uid("user"),
        email: "admin@example.com",
        displayName: "Admin",
        tenantId,
        role: Role.TenantAdmin,
      },
    } satisfies AuthedContext;
    await expect(assertTenantAccess(scoped, tenantId)).resolves.toMatchObject({ id: tenantId });
    await expect(assertTenantAccess(scoped, otherTenantId)).rejects.toThrow(/not found/i);
    await expect(assertTenantAccess({ ...scoped, isSuperAdmin: true }, otherTenantId)).resolves.toMatchObject({ id: otherTenantId });
    await expect(listTenantPresets(db, [])).resolves.toEqual([]);
  });

  it("copies one active subtree into a product and leaves the copy independent", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(products).values({ id: productId, tenantId, name: productId });
    const rootId = uid("preset");
    const childId = uid("preset");
    const unrelatedId = uid("preset");
    await db.insert(ticketTypePresets).values([
      { id: rootId, tenantId, parentId: null, level: 1, name: "Billing", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() },
      { id: childId, tenantId, parentId: rootId, level: 2, name: "Refund", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() },
      { id: unrelatedId, tenantId, parentId: null, level: 1, name: "Account", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() },
    ]);

    const created = await copyPresetToProduct(db, rootId, productId, null);
    expect(created.map((item) => item.name)).toEqual(["Billing", "Refund"]);
    expect(created[1].parentId).toBe(created[0].id);

    await db.update(ticketTypePresets).set({ name: "Payments" }).where(eq(ticketTypePresets.id, rootId));
    const copiedRoot = await db.query.ticketTypes.findFirst({ where: eq(ticketTypes.id, created[0].id) });
    expect(copiedRoot?.name).toBe("Billing");
  });

  it("rejects moves and copies that would exceed three levels without partial inserts", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(products).values({ id: productId, tenantId, name: productId });
    const root = { id: uid("preset"), tenantId, parentId: null, level: 1, name: "Root", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() };
    const child = { id: uid("preset"), tenantId, parentId: root.id, level: 2, name: "Child", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() };
    const leaf = { id: uid("preset"), tenantId, parentId: child.id, level: 3, name: "Leaf", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() };
    const sibling = { id: uid("preset"), tenantId, parentId: null, level: 1, name: "Sibling", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() };
    await db.insert(ticketTypePresets).values([root, child, leaf, sibling]);
    await expect(movePreset(db, root as typeof ticketTypePresets.$inferSelect, child.id)).rejects.toThrow(/descendant|itself/i);

    const targetRoot = { id: uid("type"), productId, parentId: null, level: 1, name: "Existing", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() };
    const targetChild = { id: uid("type"), productId, parentId: targetRoot.id, level: 2, name: "Nested", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() };
    await db.insert(ticketTypes).values([targetRoot, targetChild]);
    await expect(copyPresetToProduct(db, root.id, productId, targetChild.id)).rejects.toThrow(/three/i);
    const productRows = await db.select().from(ticketTypes).where(eq(ticketTypes.productId, productId));
    expect(productRows).toHaveLength(2);
  });
});

describe("ticket internal states", () => {
  it("validates select values, upserts current values and records history", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    const typeId = uid("type");
    const ticketId = uid("ticket");
    const stateId = uid("state");
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(products).values({ id: productId, tenantId, name: productId });
    await db.insert(ticketTypes).values({ id: typeId, productId, level: 1, name: "Refund", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() });
    await db.insert(tickets).values({ id: ticketId, tenantId, productId, teamId: uid("team"), status: TicketStatus.New, priority: TicketPriority.Medium, subject: "Refund", content: "Please refund", ticketTypeId: typeId, ticketTypePath: "[]", createdAt: NOW(), updatedAt: NOW() });
    await db.insert(ticketTypeInternalStates).values({ id: stateId, ticketTypeId: typeId, name: "Resolution", kind: "select", options: normalizeStateOptions("select", ["Refunded", "Rejected"]), sortOrder: 0, createdAt: NOW(), updatedAt: NOW() });

    await expect(setTicketInternalStateValue(db, ticketId, stateId, "Unknown", "agent-1")).rejects.toThrow(/configured/i);
    await setTicketInternalStateValue(db, ticketId, stateId, "Refunded", "agent-1");
    await setTicketInternalStateValue(db, ticketId, stateId, "Refunded", "agent-1");
    await setTicketInternalStateValue(db, ticketId, stateId, "Rejected", "agent-2");
    const value = await db.query.ticketInternalStateValues.findFirst({ where: eq(ticketInternalStateValues.ticketId, ticketId) });
    expect(value).toMatchObject({ stateId, value: "Rejected", updatedBy: "agent-2" });
    const audit = await db.select().from(history).where(eq(history.ticketId, ticketId));
    expect(audit).toHaveLength(2);
    expect(audit[1]).toMatchObject({ action: "internal_state_changed", actorId: "agent-2" });
  });

  it("keeps archived values readable but prevents further mutation", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    const typeId = uid("type");
    const ticketId = uid("ticket");
    const stateId = uid("state");
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(products).values({ id: productId, tenantId, name: productId });
    await db.insert(ticketTypes).values({ id: typeId, productId, level: 1, name: "Delivery", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() });
    await db.insert(tickets).values({ id: ticketId, tenantId, productId, teamId: uid("team"), status: TicketStatus.New, priority: TicketPriority.Medium, subject: "Delivery", content: "Delayed", ticketTypeId: typeId, ticketTypePath: "[]", createdAt: NOW(), updatedAt: NOW() });
    await db.insert(ticketTypeInternalStates).values({ id: stateId, ticketTypeId: typeId, name: "Compensated", kind: "boolean", options: null, sortOrder: 0, createdAt: NOW(), updatedAt: NOW() });
    await setTicketInternalStateValue(db, ticketId, stateId, true, "agent-1");
    await db.update(ticketTypeInternalStates).set({ archivedAt: NOW() }).where(eq(ticketTypeInternalStates.id, stateId));

    await expect(setTicketInternalStateValue(db, ticketId, stateId, false, "agent-1")).rejects.toThrow(/archived/i);
    const value = await db.query.ticketInternalStateValues.findFirst({ where: eq(ticketInternalStateValues.ticketId, ticketId) });
    expect(value?.value).toBe("true");
  });
});
