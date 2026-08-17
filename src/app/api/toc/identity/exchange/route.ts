import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { productIdentityConfigs, products } from "@/drizzle/schema";
import { withPublic, parseBody } from "@/lib/api/handler";
import { err, notFound, ok } from "@/lib/api/response";
import { localizedErr } from "@/lib/api/error-messages";
import { signCustomerToken } from "@/lib/auth/customer";
import { upsertCustomerIdentity } from "@/lib/auth/customer-record";
import {
  REMOTE_IDENTITY_SECRET_PURPOSE,
  RemoteIdentityRejectedError,
  resolveRemoteCustomerIdentity,
} from "@/lib/auth/remote-identity";
import { getEnv } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { openSecret } from "@/lib/secret-storage";
import { sha256Hex } from "@/lib/crypto";

const exchangeSchema = z.object({
  productId: z.string().min(1).max(128),
  credential: z.string().min(8).max(2048),
});

/**
 * Exchange a product-issued opaque credential for an OnFire customer token.
 * The resolver call and its configured Bearer secret stay entirely server-side.
 */
export const POST = withPublic(async (req: NextRequest, { db }) => {
  await enforceRateLimit(db, req, "toc:identity-exchange-network", {
    limit: 300,
    windowSeconds: 60,
  });
  const body = await parseBody(req, exchangeSchema);
  const credentialHash = (await sha256Hex(body.credential)).slice(0, 32);
  await enforceRateLimit(
    db,
    req,
    "toc:identity-exchange-credential",
    { limit: 5, windowSeconds: 60 },
    `${body.productId}:${credentialHash}`
  );

  const [product, config] = await Promise.all([
    db.query.products.findFirst({ where: eq(products.id, body.productId) }),
    db.query.productIdentityConfigs.findFirst({
      where: eq(productIdentityConfigs.productId, body.productId),
    }),
  ]);
  if (!product) throw notFound("Product not found");
  if (!config?.enabled || !config.endpointUrl || !config.authSecret) {
    throw notFound("Remote identity is not enabled for this product");
  }

  try {
    const authSecret = await openSecret(
      config.authSecret,
      getEnv().AUTH_SECRET,
      REMOTE_IDENTITY_SECRET_PURPOSE
    );
    const identity = await resolveRemoteCustomerIdentity({
      endpointUrl: config.endpointUrl,
      authSecret,
      productId: product.id,
      credential: body.credential,
    });
    const customer = await upsertCustomerIdentity(db, product, identity);
    const { token, expiresIn } = await signCustomerToken({
      sub: customer.id,
      productId: product.id,
      tenantId: product.tenantId,
    });
    const response = ok({
      token,
      customerId: customer.id,
      productId: product.id,
      expiresIn,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof RemoteIdentityRejectedError) {
      return localizedErr(req, "Identity credential is invalid or expired", 401);
    }
    console.error(
      JSON.stringify({
        event: "remote_identity_exchange_failed",
        productId: product.id,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    );
    return localizedErr(req, "Identity provider is temporarily unavailable", 502);
  }
});
