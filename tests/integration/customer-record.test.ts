import { beforeAll, describe, expect, it } from "vitest";
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
