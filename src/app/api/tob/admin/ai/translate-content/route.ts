import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { products } from "@/drizzle/schema";
import { ok, notFound, badRequest, forbidden, ApiError } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { hasPermission } from "@/lib/types";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseSupportedLanguages } from "@/lib/product-language";
import { translateTexts } from "@/services/ai/translation";

const translateContentSchema = z.object({
  productId: z.string().min(1),
  sourceLang: z.string().trim().min(2).max(16),
  targetLangs: z.array(z.string().trim().min(2).max(16)).min(1).max(8),
  texts: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        text: z.string().min(1).max(2_000),
      })
    )
    .min(1)
    .max(100),
});

/**
 * POST /api/tob/admin/ai/translate-content — batch plain-text translation for
 * ticket type and form template editing. Returns drafts only; nothing is
 * persisted, so saving a translation still goes through the normal
 * type/template write paths.
 */
export const POST = withAuth({}, async (req: NextRequest, ctx) => {
  if (
    !hasPermission(ctx.role, "ticket_type.write") &&
    !hasPermission(ctx.role, "ticket_template.write")
  ) {
    throw forbidden();
  }
  await enforceRateLimit(
    ctx.db,
    req,
    "tob:ai-translate-content",
    { limit: 30, windowSeconds: 60 },
    ctx.user.id
  );
  const body = await parseBody(req, translateContentSchema);
  await assertProductAccess(ctx, body.productId);
  const product = await ctx.db.query.products.findFirst({
    where: eq(products.id, body.productId),
  });
  if (!product) throw notFound("Product not found");
  if (body.sourceLang !== product.defaultLanguage) {
    throw badRequest("Source language must match the product default language");
  }
  const supported = parseSupportedLanguages(product.supportedLanguages);
  const invalidTargets = body.targetLangs.filter((lang) => !supported.includes(lang));
  if (invalidTargets.length > 0) {
    throw badRequest("Translations contain unsupported languages", invalidTargets);
  }
  if (body.targetLangs.includes(product.defaultLanguage)) {
    throw badRequest("Target languages cannot include the product default language");
  }

  try {
    const translations = await translateTexts(
      ctx.db,
      { tenantId: product.tenantId, productId: product.id },
      {
        sourceLang: body.sourceLang,
        targetLangs: body.targetLangs,
        texts: body.texts,
      }
    );
    return ok({ translations });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) {
      throw new ApiError(503, "AI translation is not configured");
    }
    console.error("AI content translation failed:", error);
    throw new ApiError(502, "AI content translation failed");
  }
});
