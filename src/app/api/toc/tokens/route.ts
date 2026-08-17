import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { productKeys, products } from "@/drizzle/schema";
import { ok, err } from "@/lib/api/response";
import { localizedErr } from "@/lib/api/error-messages";
import { withPublic, parseBody } from "@/lib/api/handler";
import { verifyProductApiKey } from "@/lib/auth/api-key";
import { signCustomerToken } from "@/lib/auth/customer";
import { upsertCustomerIdentity } from "@/lib/auth/customer-record";
import { enforceRateLimit } from "@/lib/rate-limit";

const issueTokenSchema = z
  .object({
    apiKey: z.string().min(10).max(256),
    /** Optional — omit to keep business-user PII out of OnFire entirely. */
    email: z.string().email().max(320).optional(),
    /** Business product's user identifier; the correlation key. */
    externalId: z.string().min(1).max(256).optional(),
    level: z.number().int().min(0).max(100).optional(),
  })
  .refine((data) => data.email || data.externalId, {
    message: "Either email or externalId is required",
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
    return localizedErr(req, "Invalid or revoked API key", 401);
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, key.productId),
  });
  if (!product) {
    return localizedErr(req, "Product not found", 404);
  }

  await db
    .update(productKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(productKeys.id, key.id));

  const customer = await upsertCustomerIdentity(db, product, body);

  const { token, expiresIn } = await signCustomerToken({
    sub: customer.id,
    productId: key.productId,
    tenantId: product.tenantId,
  });

  const response = ok({
    token,
    customerId: customer.id,
    productId: key.productId,
    expiresIn,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
});
