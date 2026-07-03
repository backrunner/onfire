import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { customers, productKeys, products } from "@/drizzle/schema";
import { ok, err } from "@/lib/api/response";
import { withPublic, parseBody } from "@/lib/api/handler";
import { verifyProductApiKey } from "@/lib/auth/api-key";
import { signCustomerToken } from "@/lib/auth/customer";
import { enforceRateLimit } from "@/lib/rate-limit";

const issueTokenSchema = z.object({
  apiKey: z.string().min(10).max(256),
  email: z.string().email().max(320),
  externalId: z.string().max(256).optional(),
  level: z.number().int().min(0).max(100).optional(),
});

/**
 * POST /api/toc/tokens — issue a customer JWT.
 *
 * Server-to-server endpoint: the caller authenticates with a product API key
 * (`keyId.secret`) and receives a short-lived customer token for the portal.
 */
export const POST = withPublic(async (req: NextRequest, { db }) => {
  // Brute-force guard on API-key verification
  await enforceRateLimit(db, req, "toc:tokens", { limit: 30, windowSeconds: 60 });

  const body = await parseBody(req, issueTokenSchema);

  const key = await verifyProductApiKey(db, body.apiKey);
  if (!key) {
    return err("Invalid or revoked API key", 401);
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, key.productId),
  });
  if (!product) {
    return err("Product not found", 404);
  }

  const now = new Date().toISOString();

  await db
    .update(productKeys)
    .set({ lastUsedAt: now })
    .where(eq(productKeys.id, key.id));

  // Upsert customer identity for this product
  const existing = await db.query.customers.findFirst({
    where: and(
      eq(customers.productId, key.productId),
      eq(customers.email, body.email)
    ),
  });

  let customerId: string;
  if (existing) {
    customerId = existing.id;
    await db
      .update(customers)
      .set({
        externalId: body.externalId ?? existing.externalId,
        level: body.level ?? existing.level,
        updatedAt: now,
      })
      .where(eq(customers.id, customerId));
  } else {
    customerId = crypto.randomUUID();
    await db.insert(customers).values({
      id: customerId,
      tenantId: product.tenantId,
      productId: key.productId,
      email: body.email,
      externalId: body.externalId,
      level: body.level,
      createdAt: now,
      updatedAt: now,
    });
  }

  const { token, expiresIn } = await signCustomerToken({
    sub: customerId,
    email: body.email,
    productId: key.productId,
    tenantId: product.tenantId,
    externalId: body.externalId,
    level: body.level,
  });

  return ok({
    token,
    customerId,
    productId: key.productId,
    expiresIn,
  });
});
