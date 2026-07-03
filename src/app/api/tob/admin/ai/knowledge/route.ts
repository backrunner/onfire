import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray, desc } from "drizzle-orm";
import { productKnowledge, products } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertProductAccess, tenantCondition } from "@/lib/api/scope";

const knowledgeTypeEnum = z.enum([
  "description",
  "faq",
  "feature",
  "policy",
  "troubleshooting",
]);

const createKnowledgeSchema = z.object({
  productId: z.string().min(1),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  knowledgeType: knowledgeTypeEnum,
});

export const GET = withAuth({ permission: "product.manage" }, async (req: NextRequest, ctx) => {
  const productId = new URL(req.url).searchParams.get("productId");

  // Verify product access if productId is specified
  if (productId) {
    await assertProductAccess(ctx, productId);
    const knowledge = await ctx.db
      .select()
      .from(productKnowledge)
      .where(eq(productKnowledge.productId, productId))
      .orderBy(desc(productKnowledge.createdAt));
    return ok(knowledge);
  }

  // Get all accessible products and their knowledge
  const accessibleProducts = await ctx.db
    .select({ id: products.id })
    .from(products)
    .where(tenantCondition(ctx, products.tenantId));
  const accessibleProductIds = accessibleProducts.map((p) => p.id);
  if (accessibleProductIds.length === 0) {
    return ok([]);
  }

  const knowledge = await ctx.db
    .select()
    .from(productKnowledge)
    .where(inArray(productKnowledge.productId, accessibleProductIds))
    .orderBy(desc(productKnowledge.createdAt));

  return ok(knowledge);
});

export const POST = withAuth({ permission: "product.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createKnowledgeSchema);

  // Verify product access
  await assertProductAccess(ctx, body.productId);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await ctx.db.insert(productKnowledge).values({
    id,
    productId: body.productId,
    title: body.title,
    content: body.content,
    knowledgeType: body.knowledgeType,
    createdAt: now,
    updatedAt: now,
  });

  return ok({ id }, 201);
});
