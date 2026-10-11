import { and, eq, isNull, or } from "drizzle-orm";
import { customers } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { ApiError } from "@/lib/api/response";

export interface CustomerIdentityInput {
  email?: string | null;
  externalId?: string | null;
  level?: number | null;
}

/** Upsert one product-scoped customer while preventing identity merges. */
export async function upsertCustomerIdentity(
  db: Database,
  product: { id: string; tenantId: string },
  identity: CustomerIdentityInput
) {
  const email = identity.email?.trim().toLowerCase() || null;
  const externalId = identity.externalId?.trim() || null;
  const [byExternalId, byEmail] = await Promise.all([
    externalId
      ? db.query.customers.findFirst({
          where: and(
            eq(customers.productId, product.id),
            eq(customers.externalId, externalId)
          ),
        })
      : undefined,
    email
      ? db.query.customers.findFirst({
          where: and(
            eq(customers.productId, product.id),
            eq(customers.email, email)
          ),
        })
      : undefined,
  ]);

  if (
    (byExternalId && byEmail && byExternalId.id !== byEmail.id) ||
    (externalId && byEmail?.externalId && byEmail.externalId !== externalId)
  ) {
    throw new ApiError(409, "Customer identity conflicts with an existing record");
  }

  const now = new Date().toISOString();
  async function updateExisting(existing: typeof customers.$inferSelect) {
    const next = {
      // Omitted fields must preserve the database's current values. Another
      // request may have claimed the external identity or changed the email
      // after this request read the row.
      ...(email ? { email } : {}),
      ...(externalId ? { externalId } : {}),
      ...(identity.level != null ? { level: identity.level } : {}),
      updatedAt: now,
    };
    try {
      const rows = await db
        .update(customers)
        .set(next)
        .where(and(
          eq(customers.id, existing.id),
          externalId ? or(isNull(customers.externalId), eq(customers.externalId, externalId)) : undefined,
        ))
        .returning();
      if (!rows.length) throw new ApiError(409, "Customer identity conflicts with an existing record");
      return rows[0];
    } catch (error) {
      if (!String(error).toLowerCase().includes("unique")) throw error;
      throw new ApiError(409, "Customer identity conflicts with an existing record");
    }
  }
  const existing = byExternalId ?? byEmail;
  if (existing) return updateExisting(existing);

  const customer = {
    id: crypto.randomUUID(),
    tenantId: product.tenantId,
    productId: product.id,
    email,
    externalId,
    level: identity.level ?? null,
    meta: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(customers).values(customer).onConflictDoNothing();

  // A concurrent token exchange or inbound email may have inserted the same
  // product identity after the reads above. Resolve the unique-index winner
  // instead of failing or creating a second customer.
  const [insertedByExternalId, insertedByEmail] = await Promise.all([
    externalId
      ? db.query.customers.findFirst({
          where: and(
            eq(customers.productId, product.id),
            eq(customers.externalId, externalId)
          ),
        })
      : undefined,
    email
      ? db.query.customers.findFirst({
          where: and(
            eq(customers.productId, product.id),
            eq(customers.email, email)
          ),
        })
      : undefined,
  ]);
  if (
    insertedByExternalId &&
    insertedByEmail &&
    insertedByExternalId.id !== insertedByEmail.id
  ) {
    throw new ApiError(409, "Customer identity conflicts with an existing record");
  }
  const winner = insertedByExternalId ?? insertedByEmail;
  if (externalId && winner?.externalId && winner.externalId !== externalId) {
    throw new ApiError(409, "Customer identity conflicts with an existing record");
  }
  if (!winner) {
    throw new Error("Customer identity could not be persisted");
  }
  // A concurrent email-only insert must also acquire this external identity
  // atomically before issuing a token; never return an unlinked customer.
  return updateExisting(winner);
}
