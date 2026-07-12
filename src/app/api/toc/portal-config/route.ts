import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { products } from "@/drizzle/schema";
import { withPublic, parseQuery } from "@/lib/api/handler";
import { ok, notFound } from "@/lib/api/response";
import { safeHttpUrl } from "@/lib/external-url";
import { enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const querySchema = z.object({ productId: z.string().min(1).max(128) });

/**
 * GET /api/toc/portal-config?productId=...
 *
 * This endpoint intentionally exposes only safe, public return destinations.
 * It is used after a customer JWT expires, when authenticated whoami is no
 * longer available.
 */
export const GET = withPublic(async (req: NextRequest, { db }) => {
  await enforceRateLimit(db, req, "toc:portal-config", {
    limit: 60,
    windowSeconds: 60,
  });
  const { productId } = parseQuery(req, querySchema);
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });
  if (!product) throw notFound("Product not found");

  const homepageUrl = safeHttpUrl(product.homepageUrl);
  const portalReturnUrl = safeHttpUrl(product.portalReturnUrl);
  return ok({
    homepageUrl,
    portalReturnUrl,
    redirectUrl: portalReturnUrl ?? homepageUrl,
  });
});
