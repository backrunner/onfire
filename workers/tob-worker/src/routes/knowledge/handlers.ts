import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { resolveContext } from '../../core/context';
import { assertPermission } from '@onfire/shared/rbac';
import { productDocuments, productKnowledge, products, type KnowledgeType, type DocumentStatus } from '@onfire/shared/drizzle/schema';
import type { Bindings } from '../../core/types';

const assertProductAccess = async (store: any, env: Bindings, userId: string, productId: string) => {
  const user = { id: userId };
  const ctx = await resolveContext(env, user as any);
  assertPermission(ctx, 'product.manage');

  const product = await store.db.select().from(products).where(eq(products.id, productId)).get();
  if (!product) throw new Response('Product not found', { status: 404 });

  if (ctx.user.role !== 'SuperAdmin' && !ctx.tenantIds.includes(product.tenantId)) {
    throw new Response('Access denied', { status: 403 });
  }

  return { ctx, product };
};

export const listDocuments = async (env: Bindings, store: any, user: any, productId: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  await assertProductAccess(store, env, user.id, productId);

  const docs = await store.db
    .select()
    .from(productDocuments)
    .where(eq(productDocuments.productId, productId))
    .all();

  return { data: docs };
};

export const uploadDocument = async (env: Bindings, store: any, user: any, productId: string, request: Request) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  await assertProductAccess(store, env, user.id, productId);

  if (!env.KNOWLEDGE_BUCKET) throw new Response('R2 bucket not configured', { status: 500 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) throw new Response('No file provided', { status: 400 });

  const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown', 'application/json'];
  if (!allowedTypes.includes(file.type)) {
    throw new Response('Invalid file type. Allowed: PDF, TXT, MD, JSON', { status: 400 });
  }

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) throw new Response('File too large. Maximum size: 10MB', { status: 400 });

  const docId = nanoid();
  const r2Key = `products/${productId}/documents/${docId}/${file.name}`;
  const now = new Date().toISOString();

  await env.KNOWLEDGE_BUCKET.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { productId, originalName: file.name }
  });

  await store.db.insert(productDocuments).values({
    id: docId,
    productId,
    filename: file.name,
    r2Key,
    mimeType: file.type,
    sizeBytes: file.size,
    status: 'pending' as DocumentStatus,
    vectorizeIds: null,
    createdAt: now,
    updatedAt: now
  });

  return { id: docId, filename: file.name, success: true };
};

export const deleteDocument = async (env: Bindings, store: any, user: any, productId: string, docId: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  await assertProductAccess(store, env, user.id, productId);

  const doc = await store.db
    .select()
    .from(productDocuments)
    .where(and(eq(productDocuments.id, docId), eq(productDocuments.productId, productId)))
    .get();

  if (!doc) throw new Response('Document not found', { status: 404 });

  if (env.KNOWLEDGE_BUCKET) {
    try {
      await env.KNOWLEDGE_BUCKET.delete(doc.r2Key);
    } catch (err) {
      console.error('Failed to delete from R2:', err);
    }
  }

  await store.db.delete(productDocuments).where(eq(productDocuments.id, docId));
  return { success: true };
};

export const downloadDocument = async (env: Bindings, store: any, user: any, productId: string, docId: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  await assertProductAccess(store, env, user.id, productId);

  const doc = await store.db
    .select()
    .from(productDocuments)
    .where(and(eq(productDocuments.id, docId), eq(productDocuments.productId, productId)))
    .get();

  if (!doc) throw new Response('Document not found', { status: 404 });
  if (!env.KNOWLEDGE_BUCKET) throw new Response('R2 bucket not configured', { status: 500 });

  const object = await env.KNOWLEDGE_BUCKET.get(doc.r2Key);
  if (!object) throw new Response('File not found in storage', { status: 404 });

  return new Response(object.body, {
    headers: {
      'Content-Type': doc.mimeType,
      'Content-Disposition': `attachment; filename="${doc.filename}"`,
      'Content-Length': String(doc.sizeBytes)
    }
  });
};

export const listKnowledge = async (env: Bindings, store: any, user: any, productId: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  await assertProductAccess(store, env, user.id, productId);

  const entries = await store.db
    .select()
    .from(productKnowledge)
    .where(eq(productKnowledge.productId, productId))
    .all();

  return { data: entries };
};

export const createKnowledge = async (
  env: Bindings,
  store: any,
  user: any,
  productId: string,
  body: { title: string; content: string; knowledgeType: string }
) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  await assertProductAccess(store, env, user.id, productId);

  const knowledgeId = nanoid();
  const now = new Date().toISOString();

  await store.db.insert(productKnowledge).values({
    id: knowledgeId,
    productId,
    title: body.title,
    content: body.content,
    knowledgeType: body.knowledgeType as KnowledgeType,
    vectorizeIds: null,
    createdAt: now,
    updatedAt: now
  });

  return { id: knowledgeId, success: true };
};

export const updateKnowledge = async (
  env: Bindings,
  store: any,
  user: any,
  productId: string,
  knowledgeId: string,
  body: { title?: string; content?: string; knowledgeType?: string }
) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  await assertProductAccess(store, env, user.id, productId);

  const existing = await store.db
    .select()
    .from(productKnowledge)
    .where(and(eq(productKnowledge.id, knowledgeId), eq(productKnowledge.productId, productId)))
    .get();

  if (!existing) throw new Response('Knowledge entry not found', { status: 404 });

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) updates.content = body.content;
  if (body.knowledgeType !== undefined) updates.knowledgeType = body.knowledgeType;

  await store.db.update(productKnowledge).set(updates).where(eq(productKnowledge.id, knowledgeId));
  return { success: true };
};

export const deleteKnowledge = async (env: Bindings, store: any, user: any, productId: string, knowledgeId: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  await assertProductAccess(store, env, user.id, productId);

  const existing = await store.db
    .select()
    .from(productKnowledge)
    .where(and(eq(productKnowledge.id, knowledgeId), eq(productKnowledge.productId, productId)))
    .get();

  if (!existing) throw new Response('Knowledge entry not found', { status: 404 });

  await store.db.delete(productKnowledge).where(eq(productKnowledge.id, knowledgeId));
  return { success: true };
};
