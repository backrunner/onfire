import { NextRequest } from "next/server";
import { eq, inArray, desc } from "drizzle-orm";
import { productDocuments, products } from "@/drizzle/schema";
import { ok, badRequest } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { assertProductAccess, productScopeCondition } from "@/lib/api/scope";
import { getEnv } from "@/lib/db";
import { readBodyBytes } from "@/lib/request-body";

export const GET = withAuth({ permission: "ai.knowledge" }, async (req: NextRequest, ctx) => {
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
    .where(productScopeCondition(ctx));
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

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export const POST = withAuth({ permission: "ai.knowledge" }, async (req: NextRequest, ctx) => {
  // Handle multipart form data for file upload
  const requestBytes = await readBodyBytes(req, MAX_DOCUMENT_BYTES + 2 * 1024 * 1024);
  const formData = await new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: requestBytes,
  }).formData();
  const file = formData.get("file") as File | null;
  const productId = formData.get("productId") as string | null;

  if (!file || !productId) {
    throw badRequest("Missing file or productId");
  }

  // Verify product access
  await assertProductAccess(ctx, productId);

  // Validate file type and size
  if (!allowedTypes.includes(file.type)) {
    throw badRequest("Unsupported file type");
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw badRequest("File exceeds the 10 MB limit");
  }
  if (file.size === 0) {
    throw badRequest("File is empty");
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const safeFilename =
    file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 255) || "document";
  const r2Key = `documents/${productId}/${id}/${safeFilename}`;

  await getEnv().R2.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  try {
    await ctx.db.insert(productDocuments).values({
      id,
      productId,
      filename: file.name.slice(0, 500),
      r2Key,
      mimeType: file.type,
      sizeBytes: file.size,
      // `ready` currently means the source file is safely stored. Text
      // extraction/indexing remains a separate, explicitly unavailable step.
      status: "ready",
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    try {
      await getEnv().R2.delete(r2Key);
    } catch (cleanupError) {
      console.error("Failed to roll back uploaded document:", cleanupError);
    }
    throw error;
  }

  return ok({ id, r2Key }, 201);
});
