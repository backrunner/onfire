import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { products } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withCustomerAuth } from "@/lib/api/handler";
import { parseSupportedLanguages } from "@/lib/product-language";

/**
 * GET /api/toc/whoami — verify the customer token and return identity plus
 * product display info for the portal header.
 */
export const GET = withCustomerAuth(async (_req: NextRequest, { db, customer }) => {
  const product = await db.query.products.findFirst({
    where: eq(products.id, customer.productId),
  });

  return ok({
    customerId: customer.sub,
    email: customer.email ?? null,
    productId: customer.productId,
    productName: product?.name ?? null,
    externalId: customer.externalId ?? null,
    level: customer.level ?? null,
    /** What the portal header should show as the signed-in identity. */
    displayName: customer.email ?? customer.externalId ?? null,
    /** Product content languages; drives the portal language switcher. */
    defaultLanguage: product?.defaultLanguage ?? "en",
    supportedLanguages: parseSupportedLanguages(product?.supportedLanguages),
  });
});
