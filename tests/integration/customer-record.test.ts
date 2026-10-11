import { beforeAll, describe, expect, it, vi } from "vitest";
import { customers, products, tenants } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { upsertCustomerIdentity } from "@/lib/auth/customer-record";
import { createTestDb, uid } from "./test-db";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

describe("customer identity persistence", () => {
  async function productFixture() {
    const tenantId = uid("tenant");
    const product = { id: uid("product"), tenantId };
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(products).values({ ...product, name: product.id });
    return product;
  }

  it("preserves one customer and history identity across a verified email change", async () => {
    const product = await productFixture();
    const first = await upsertCustomerIdentity(db, product, { email: "old@example.com", externalId: "iconwiz:account-1" });
    const next = await upsertCustomerIdentity(db, product, { email: "new@example.com", externalId: "iconwiz:account-1" });
    expect(next.id).toBe(first.id);
    expect(next.externalId).toBe(first.externalId);
    expect(next.email).toBe("new@example.com");
  });

  it("rejects another account claiming an already linked mailbox without rebinding it", async () => {
    const product = await productFixture();
    const first = await upsertCustomerIdentity(db, product, { email: "same@example.com", externalId: "iconwiz:account-1" });
    await expect(upsertCustomerIdentity(db, product, { email: "SAME@example.com", externalId: "iconwiz:account-2" })).rejects.toThrow("identity conflicts");
    expect((await db.query.customers.findFirst({ where: eq(customers.id, first.id) }))?.externalId).toBe("iconwiz:account-1");
  });

  it("atomically claims an email-only customer when two accounts race", async () => {
    const product = await productFixture();
    const first = await upsertCustomerIdentity(db, product, { email: "email-only@example.com" });
    const results = await Promise.allSettled([
      upsertCustomerIdentity(db, product, { email: first.email!, externalId: "iconwiz:a" }),
      upsertCustomerIdentity(db, product, { email: first.email!, externalId: "iconwiz:b" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("preserves an identity and level bound after an email-only lookup", async () => {
    const product = await productFixture();
    const first = await upsertCustomerIdentity(db, product, { email: "claim@example.com" });
    const findFirst = db.query.customers.findFirst.bind(db.query.customers);
    const lookup = vi.spyOn(db.query.customers, "findFirst").mockImplementationOnce((config) => {
      const query = findFirst(config);
      const execute = query.execute.bind(query);
      vi.spyOn(query, "execute").mockImplementationOnce(async () => {
        const stale = await execute();
        await db.update(customers).set({ externalId: "account:claimed", level: 99 }).where(eq(customers.id, first.id));
        return stale;
      });
      return query;
    });
    try {
      const updated = await upsertCustomerIdentity(db, product, { email: first.email });
      expect(updated.externalId).toBe("account:claimed");
      expect(updated.level).toBe(99);
    } finally {
      lookup.mockRestore();
    }
  });

  it("preserves an email changed after an external-identity-only lookup", async () => {
    const product = await productFixture();
    const first = await upsertCustomerIdentity(db, product, { email: "before@example.com", externalId: "account:email-change" });
    const findFirst = db.query.customers.findFirst.bind(db.query.customers);
    const lookup = vi.spyOn(db.query.customers, "findFirst").mockImplementationOnce((config) => {
      const query = findFirst(config);
      const execute = query.execute.bind(query);
      vi.spyOn(query, "execute").mockImplementationOnce(async () => {
        const stale = await execute();
        await db.update(customers).set({ email: "after@example.com" }).where(eq(customers.id, first.id));
        return stale;
      });
      return query;
    });
    try {
      const updated = await upsertCustomerIdentity(db, product, { externalId: first.externalId });
      expect(updated.email).toBe("after@example.com");
    } finally {
      lookup.mockRestore();
    }
  });

  it("normalizes email before lookup and persistence", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    const product = { id: productId, tenantId };
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(products).values({ ...product, name: productId });

    const created = await upsertCustomerIdentity(db, product, {
      email: "  USER@Example.COM ",
      externalId: "customer-1",
      level: 10,
    });
    const updated = await upsertCustomerIdentity(db, product, {
      email: "user@example.com",
      level: 20,
    });

    expect(created.email).toBe("user@example.com");
    expect(updated.id).toBe(created.id);
    expect(updated.email).toBe("user@example.com");
    expect(updated.externalId).toBe("customer-1");
    expect(updated.level).toBe(20);
  });

  it("converges concurrent creation on one product-scoped customer", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    const product = { id: productId, tenantId };
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(products).values({ ...product, name: productId });

    const [first, second] = await Promise.all([
      upsertCustomerIdentity(db, product, {
        email: "race@example.com",
        externalId: " race-customer ",
      }),
      upsertCustomerIdentity(db, product, {
        email: "RACE@example.com",
        externalId: "race-customer",
      }),
    ]);

    expect(first.id).toBe(second.id);
    expect(first.externalId).toBe("race-customer");
    const rows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.productId, productId));
    expect(rows).toHaveLength(1);
  });
});
