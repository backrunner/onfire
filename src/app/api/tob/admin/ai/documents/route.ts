import { NextRequest } from "next/server";
import { eq, inArray, desc } from "drizzle-orm";
import { productDocuments, products } from "@/drizzle/schema";
import { ok, badRequest } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { assertProductAccess, tenantCondition } from "@/lib/api/scope";

export const GET = withAuth({ permission: "product.manage" }, async (req: NextRequest, ctx) => {
  const productId = new URL(req.url).searchParams.get("productId");

  // Verify product access if productId is specified
  if (productId) {
    await assertProductAccess(ctx, productId);
    const documents = await ctx.db
      .select()
      .from(productDocuments)
      .where(eq(productDocuments.productId, productId))
      .orderBy(desc(productDocuments.createdAt));
    return ok(documents);
  }

  // Get all accessible products and their documents
  const accessibleProducts = await ctx.db
    .select({ id: products.id })
    .from(products)
    .where(tenantCondition(ctx, products.tenantId));
  const accessibleProductIds = accessibleProducts.map((p) => p.id);
  if (accessibleProductIds.length === 0) {
    return ok([]);
  }

  const documents = await ctx.db
    .select()
    .from(productDocuments)
    .where(inArray(productDocuments.productId, accessibleProductIds))
    .orderBy(desc(productDocuments.createdAt));

  return ok(documents);
});

const allowedTypes = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const POST = withAuth({ permission: "product.manage" }, async (req: NextRequest, ctx) => {
  // Handle multipart form data for file upload
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const productId = formData.get("productId") as string | null;

  if (!file || !productId) {
    throw badRequest("Missing file or productId");
  }

  // Verify product access
  await assertProductAccess(ctx, productId);

  // Validate file type
  if (!allowedTypes.includes(file.type)) {
    throw badRequest("Unsupported file type");
  }

  // In a real implementation, you would upload to R2 here
  // For now, we'll create a placeholder record
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const r2Key = `documents/${productId}/${id}/${file.name}`;

  await ctx.db.insert(productDocuments).values({
    id,
    productId,
    filename: file.name,
    r2Key,
    mimeType: file.type,
    sizeBytes: file.size,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  // TODO: Upload file to R2 and trigger processing
  // const arrayBuffer = await file.arrayBuffer();
  // await env.R2_BUCKET.put(r2Key, arrayBuffer);

  return ok({ id, r2Key }, 201);
});
