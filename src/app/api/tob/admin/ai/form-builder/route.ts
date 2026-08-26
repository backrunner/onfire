import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { products } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { ApiError, badRequest, notFound, ok } from "@/lib/api/response";
import { enforceRateLimit } from "@/lib/rate-limit";
import { generateFormSchema } from "@/services/ai/form-builder";

const requestSchema = z.object({
  productId: z.string().min(1),
  message: z.string().trim().min(1).max(8_000),
  currentSchema: z.unknown().optional(),
  defaultLanguage: z.string().trim().min(2).max(16),
  interfaceLanguage: z.enum(["en", "zh"]),
});

/** Generate a validated form draft. Persistence remains behind the normal save action. */
export const POST = withAuth(
  { permission: "ticket_template.write" },
  async (req: NextRequest, ctx) => {
    await enforceRateLimit(
      ctx.db,
      req,
      "tob:ai-form-builder",
      { limit: 20, windowSeconds: 60 },
      ctx.user.id
    );
    const body = await parseBody(req, requestSchema);
    const accessible = await assertProductAccess(ctx, body.productId);
    const product = await ctx.db.query.products.findFirst({
      where: eq(products.id, accessible.id),
    });
    if (!product) throw notFound("Product not found");
    if (body.defaultLanguage !== product.defaultLanguage) {
      throw badRequest("Default language does not match the product");
    }
    try {
      const result = await generateFormSchema(
        ctx.db,
        { tenantId: product.tenantId, productId: product.id },
        body
      );
      if (!result) throw new ApiError(503, "AI form builder is not configured");
      return ok(result);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error("AI form generation failed:", error);
      throw new ApiError(502, "AI form generation failed");
    }
  }
);
