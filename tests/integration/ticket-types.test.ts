import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  productTeams,
  products,
  teams,
  tenants,
  ticketTemplates,
  ticketTemplateVersions,
  ticketTypeRoutes,
  ticketTypes,
} from "@/drizzle/schema";
import { createEmptyFormSchema } from "@/lib/form-schema";
import {
  ensureUnclassifiedType,
  loadCurrentTemplateVersion,
  loadTicketTypePath,
  resolveTicketTypeTeam,
  ticketTypePathSnapshot,
} from "@/services/ticket-types";
import {
  cloneTemplateVersion,
  createTemplateVersion,
  restoreArchivedTemplate,
} from "@/services/ticket-templates";
import { createTestDb, NOW, uid } from "./test-db";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

describe("ticket type hierarchy and immutable templates", () => {
  it("resolves the nearest ancestor route and snapshots a three-level path", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    const teamId = uid("team");
    await db.insert(tenants).values({ id: tenantId, name: tenantId, defaultTeamId: null });
    await db.insert(products).values({ id: productId, tenantId, name: productId });
    await db.insert(teams).values({ id: teamId, tenantId, name: teamId });
    await db.insert(productTeams).values({ productId, teamId });

    const root = { id: uid("type"), productId, parentId: null, level: 1, name: "Account", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() };
    const child = { id: uid("type"), productId, parentId: root.id, level: 2, name: "Login", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() };
    const leaf = { id: uid("type"), productId, parentId: child.id, level: 3, name: "MFA", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() };
    await db.insert(ticketTypes).values([root, child, leaf]);
    await db.insert(ticketTypeRoutes).values({ ticketTypeId: child.id, teamId, createdAt: NOW(), updatedAt: NOW() });

    const path = await loadTicketTypePath(db, leaf as typeof ticketTypes.$inferSelect);
    expect(ticketTypePathSnapshot(path).map((item) => item.name)).toEqual([
      "Account",
      "Login",
      "MFA",
    ]);
    await expect(resolveTicketTypeTeam(db, path, null)).resolves.toBe(teamId);
  });

  it("creates immediately active versions and restores old content as N+1", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    const typeId = uid("type");
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(products).values({ id: productId, tenantId, name: productId });
    await db.insert(ticketTypes).values({ id: typeId, productId, level: 1, name: "Bug", sortOrder: 0, createdAt: NOW(), updatedAt: NOW() });

    const schemaV1 = createEmptyFormSchema();
    const first = await createTemplateVersion(db, { ticketTypeId: typeId, formSchema: schemaV1 });
    const schemaV2 = { ...schemaV1, fields: [{ id: "detail", key: "detail", label: "Detail", type: "text" as const }] };
    const second = await createTemplateVersion(db, { ticketTypeId: typeId, formSchema: schemaV2 });
    const third = await cloneTemplateVersion(db, first.versionId, { ticketTypeId: typeId });

    expect([first.version, second.version, third.version]).toEqual([1, 2, 3]);
    const current = await loadCurrentTemplateVersion(db, typeId);
    expect(current?.version.id).toBe(third.versionId);
    expect(JSON.parse(current!.version.formSchema)).toEqual(schemaV1);
    const v1 = await db.query.ticketTemplateVersions.findFirst({
      where: eq(ticketTemplateVersions.id, first.versionId),
    });
    expect(v1?.invalidatedAt).toBeNull();
  });

  it("does not allow invalidated version content to be restored", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    const typeId = uid("type");
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(products).values({ id: productId, tenantId, name: productId });
    await db.insert(ticketTypes).values({
      id: typeId,
      productId,
      level: 1,
      name: "Billing",
      sortOrder: 0,
      createdAt: NOW(),
      updatedAt: NOW(),
    });
    const version = await createTemplateVersion(db, {
      ticketTypeId: typeId,
      formSchema: createEmptyFormSchema(),
    });
    await db
      .update(ticketTemplateVersions)
      .set({
        invalidatedAt: NOW(),
        invalidationReason: "Contains a retired field",
      })
      .where(eq(ticketTemplateVersions.id, version.versionId));

    await expect(
      cloneTemplateVersion(db, version.versionId, { ticketTypeId: typeId })
    ).rejects.toThrow(/invalidated/i);
  });

  it("copies the latest valid content when restoring an archived template with an invalid current version", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    const typeId = uid("type");
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(products).values({ id: productId, tenantId, name: productId });
    await db.insert(ticketTypes).values({
      id: typeId,
      productId,
      level: 1,
      name: "Account",
      sortOrder: 0,
      createdAt: NOW(),
      updatedAt: NOW(),
    });
    const schemaV1 = createEmptyFormSchema();
    const first = await createTemplateVersion(db, {
      ticketTypeId: typeId,
      formSchema: schemaV1,
    });
    const second = await createTemplateVersion(db, {
      ticketTypeId: typeId,
      formSchema: {
        ...schemaV1,
        fields: [{ id: "detail", key: "detail", label: "Detail", type: "text" }],
      },
    });
    const template = (await db.query.ticketTemplates.findFirst({
      where: eq(ticketTemplates.ticketTypeId, typeId),
    }))!;
    await db
      .update(ticketTemplates)
      .set({ archivedAt: NOW(), archivedBy: "admin" })
      .where(eq(ticketTemplates.id, template.id));
    await db
      .update(ticketTemplateVersions)
      .set({ invalidatedAt: NOW(), invalidatedBy: "admin", invalidationReason: "Retired" })
      .where(eq(ticketTemplateVersions.id, second.versionId));

    const result = await restoreArchivedTemplate(
      db,
      { ...template, archivedAt: NOW(), archivedBy: "admin" },
      "admin"
    );

    expect(result).toMatchObject({ copied: true, version: 3 });
    const restored = await loadCurrentTemplateVersion(db, typeId);
    expect(restored?.template.archivedAt).toBeNull();
    expect(restored?.version.id).not.toBe(first.versionId);
    expect(JSON.parse(restored!.version.formSchema)).toEqual(schemaV1);
  });

  it("creates one stable unclassified type per product", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(products).values({ id: productId, tenantId, name: productId });
    const first = await ensureUnclassifiedType(db, productId);
    const second = await ensureUnclassifiedType(db, productId);
    expect(second.id).toBe(first.id);
    const rows = await db.select().from(ticketTypes).where(eq(ticketTypes.productId, productId));
    expect(rows.filter((row) => row.systemKey === "unclassified")).toHaveLength(1);
  });
});
