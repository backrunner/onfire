import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { assertPermission } from '@onfire/shared/rbac';
import { Role } from '@onfire/shared';
import { productDocuments, productKnowledge, products, type KnowledgeType, type DocumentStatus } from '@onfire/shared/drizzle/schema';
import { createRouter } from '../../core/router';
import { handleResult, errorResult } from '../../core/route-utils';
import { resolveContext } from '../../core/context';
import type { AuthUser } from '../../core/types';
import { ok } from '../../core/response';

interface KnowledgeUpdate {
  title?: string;
  content?: string;
  knowledgeType?: KnowledgeType;
  updatedAt: string;
}

export const knowledgeRoutes = () => {
  const router = createRouter();

  // GET /admin/products/:id/documents
  router.get('/admin/products/:id/documents', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });

    const productId = c.req.param('id');
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'product.manage');

    const product = await db.select().from(products).where(eq(products.id, productId)).get();
    if (!product) throw new Response('Product not found', { status: 404 });
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(product.tenantId)) {
      throw new Response('Access denied', { status: 403 });
    }

    const docs = await db
      .select()
      .from(productDocuments)
      .where(eq(productDocuments.productId, productId))
      .all();

    return c.json(ok({ data: docs }));
  });

  // POST /admin/products/:id/documents
  router.post('/admin/products/:id/documents', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });

    const productId = c.req.param('id');
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'product.manage');

    const product = await db.select().from(products).where(eq(products.id, productId)).get();
    if (!product) throw new Response('Product not found', { status: 404 });
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(product.tenantId)) {
      throw new Response('Access denied', { status: 403 });
    }

    if (!c.env.KNOWLEDGE_BUCKET) throw new Response('R2 bucket not configured', { status: 500 });

    const formData = await c.req.raw.formData();
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

    await c.env.KNOWLEDGE_BUCKET.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { productId, originalName: file.name }
    });

    await db.insert(productDocuments).values({
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

    return c.json(ok({ id: docId, filename: file.name, success: true }));
  });

  // DELETE /admin/products/:id/documents/:docId
  router.delete('/admin/products/:id/documents/:docId', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });

    const productId = c.req.param('id');
    const docId = c.req.param('docId');
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'product.manage');

    const product = await db.select().from(products).where(eq(products.id, productId)).get();
    if (!product) throw new Response('Product not found', { status: 404 });
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(product.tenantId)) {
      throw new Response('Access denied', { status: 403 });
    }

    const doc = await db
      .select()
      .from(productDocuments)
      .where(and(eq(productDocuments.id, docId), eq(productDocuments.productId, productId)))
      .get();

    if (!doc) throw new Response('Document not found', { status: 404 });

    if (c.env.KNOWLEDGE_BUCKET) {
      try {
        await c.env.KNOWLEDGE_BUCKET.delete(doc.r2Key);
      } catch (err) {
        console.error('Failed to delete from R2:', err);
      }
    }

    await db.delete(productDocuments).where(eq(productDocuments.id, docId));
    return c.json(ok({ success: true }));
  });

  // GET /admin/products/:id/documents/:docId/download
  router.get('/admin/products/:id/documents/:docId/download', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });

    const productId = c.req.param('id');
    const docId = c.req.param('docId');
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'product.manage');

    const product = await db.select().from(products).where(eq(products.id, productId)).get();
    if (!product) throw new Response('Product not found', { status: 404 });
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(product.tenantId)) {
      throw new Response('Access denied', { status: 403 });
    }

    const doc = await db
      .select()
      .from(productDocuments)
      .where(and(eq(productDocuments.id, docId), eq(productDocuments.productId, productId)))
      .get();

    if (!doc) throw new Response('Document not found', { status: 404 });
    if (!c.env.KNOWLEDGE_BUCKET) throw new Response('R2 bucket not configured', { status: 500 });

    const object = await c.env.KNOWLEDGE_BUCKET.get(doc.r2Key);
    if (!object) throw new Response('File not found in storage', { status: 404 });

    return new Response(object.body as unknown as BodyInit, {
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `attachment; filename="${doc.filename}"`,
        'Content-Length': String(doc.sizeBytes)
      }
    });
  });

  // GET /admin/products/:id/knowledge
  router.get('/admin/products/:id/knowledge', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });

    const productId = c.req.param('id');
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'product.manage');

    const product = await db.select().from(products).where(eq(products.id, productId)).get();
    if (!product) throw new Response('Product not found', { status: 404 });
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(product.tenantId)) {
      throw new Response('Access denied', { status: 403 });
    }

    const entries = await db
      .select()
      .from(productKnowledge)
      .where(eq(productKnowledge.productId, productId))
      .all();

    return c.json(ok({ data: entries }));
  });

  // POST /admin/products/:id/knowledge
  router.post('/admin/products/:id/knowledge', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });

    const productId = c.req.param('id');
    const body = await c.req.json<{ title: string; content: string; knowledgeType: string }>();
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'product.manage');

    const product = await db.select().from(products).where(eq(products.id, productId)).get();
    if (!product) throw new Response('Product not found', { status: 404 });
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(product.tenantId)) {
      throw new Response('Access denied', { status: 403 });
    }

    const knowledgeId = nanoid();
    const now = new Date().toISOString();

    await db.insert(productKnowledge).values({
      id: knowledgeId,
      productId,
      title: body.title,
      content: body.content,
      knowledgeType: body.knowledgeType as KnowledgeType,
      vectorizeIds: null,
      createdAt: now,
      updatedAt: now
    });

    return c.json(ok({ id: knowledgeId, success: true }));
  });

  // PATCH /admin/products/:id/knowledge/:knowledgeId
  router.patch('/admin/products/:id/knowledge/:knowledgeId', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });

    const productId = c.req.param('id');
    const knowledgeId = c.req.param('knowledgeId');
    const body = await c.req.json<{ title?: string; content?: string; knowledgeType?: string }>();
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'product.manage');

    const product = await db.select().from(products).where(eq(products.id, productId)).get();
    if (!product) throw new Response('Product not found', { status: 404 });
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(product.tenantId)) {
      throw new Response('Access denied', { status: 403 });
    }

    const existing = await db
      .select()
      .from(productKnowledge)
      .where(and(eq(productKnowledge.id, knowledgeId), eq(productKnowledge.productId, productId)))
      .get();

    if (!existing) throw new Response('Knowledge entry not found', { status: 404 });

    const updates: KnowledgeUpdate = { updatedAt: new Date().toISOString() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.knowledgeType !== undefined) updates.knowledgeType = body.knowledgeType as KnowledgeType;

    await db.update(productKnowledge).set(updates).where(eq(productKnowledge.id, knowledgeId));
    return c.json(ok({ success: true }));
  });

  // DELETE /admin/products/:id/knowledge/:knowledgeId
  router.delete('/admin/products/:id/knowledge/:knowledgeId', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });

    const productId = c.req.param('id');
    const knowledgeId = c.req.param('knowledgeId');
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'product.manage');

    const product = await db.select().from(products).where(eq(products.id, productId)).get();
    if (!product) throw new Response('Product not found', { status: 404 });
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(product.tenantId)) {
      throw new Response('Access denied', { status: 403 });
    }

    const existing = await db
      .select()
      .from(productKnowledge)
      .where(and(eq(productKnowledge.id, knowledgeId), eq(productKnowledge.productId, productId)))
      .get();

    if (!existing) throw new Response('Knowledge entry not found', { status: 404 });

    await db.delete(productKnowledge).where(eq(productKnowledge.id, knowledgeId));
    return c.json(ok({ success: true }));
  });

  return router;
};
