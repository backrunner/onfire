/**
 * Knowledge Base Routes
 * Endpoints for managing product documents and knowledge entries
 */

import { Elysia, t } from 'elysia';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Bindings, WorkerSingleton } from '../core/types';
import { resolveContext } from '../core/context';
import { assertPermission } from '@onfire/shared/rbac';
import { productDocuments, productKnowledge, products, type KnowledgeType, type DocumentStatus } from '@onfire/shared/drizzle/schema';

const assertProductAccess = async (store: any, env: Bindings, userId: string, productId: string) => {
  const user = { id: userId };
  const ctx = await resolveContext(env, user as any);
  assertPermission(ctx, 'product.manage');

  const product = await store.db.select().from(products).where(eq(products.id, productId)).get();
  if (!product) {
    throw new Response('Product not found', { status: 404 });
  }

  // Check tenant access for non-SuperAdmin
  if (ctx.user.role !== 'SuperAdmin' && !ctx.tenantIds.includes(product.tenantId)) {
    throw new Response('Access denied', { status: 403 });
  }

  return { ctx, product };
};

const KnowledgeBody = t.Object({
  title: t.String({ minLength: 1 }),
  content: t.String({ minLength: 1 }),
  knowledgeType: t.Union([
    t.Literal('description'),
    t.Literal('faq'),
    t.Literal('feature'),
    t.Literal('policy'),
    t.Literal('troubleshooting')
  ])
});

const KnowledgeUpdateBody = t.Object({
  title: t.Optional(t.String({ minLength: 1 })),
  content: t.Optional(t.String({ minLength: 1 })),
  knowledgeType: t.Optional(t.Union([
    t.Literal('description'),
    t.Literal('faq'),
    t.Literal('feature'),
    t.Literal('policy'),
    t.Literal('troubleshooting')
  ]))
});

export const createKnowledgeRoutes = (env: Bindings) =>
  new Elysia<'', false, WorkerSingleton>()
    // ==================== Product Documents ====================

    // List documents for a product
    .get('/admin/products/:productId/documents', async ({ store, params }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      await assertProductAccess(store, env, user.id, params.productId);

      const docs = await store.db
        .select()
        .from(productDocuments)
        .where(eq(productDocuments.productId, params.productId))
        .all();

      return { data: docs };
    })

    // Upload document (multipart form)
    .post('/admin/products/:productId/documents', async ({ store, params, request }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      await assertProductAccess(store, env, user.id, params.productId);

      if (!env.KNOWLEDGE_BUCKET) {
        throw new Response('R2 bucket not configured', { status: 500 });
      }

      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        throw new Response('No file provided', { status: 400 });
      }

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'text/plain',
        'text/markdown',
        'application/json'
      ];
      if (!allowedTypes.includes(file.type)) {
        throw new Response('Invalid file type. Allowed: PDF, TXT, MD, JSON', { status: 400 });
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Response('File too large. Maximum size: 10MB', { status: 400 });
      }

      const id = nanoid();
      const r2Key = `products/${params.productId}/documents/${id}/${file.name}`;
      const now = new Date().toISOString();

      // Upload to R2
      await env.KNOWLEDGE_BUCKET.put(r2Key, await file.arrayBuffer(), {
        httpMetadata: {
          contentType: file.type
        },
        customMetadata: {
          productId: params.productId,
          originalName: file.name
        }
      });

      // Save metadata to database
      await store.db.insert(productDocuments).values({
        id,
        productId: params.productId,
        filename: file.name,
        r2Key,
        mimeType: file.type,
        sizeBytes: file.size,
        status: 'pending' as DocumentStatus,
        vectorizeIds: null,
        createdAt: now,
        updatedAt: now
      });

      return { id, filename: file.name, success: true };
    })

    // Delete document
    .delete('/admin/products/:productId/documents/:docId', async ({ store, params }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      await assertProductAccess(store, env, user.id, params.productId);

      const doc = await store.db
        .select()
        .from(productDocuments)
        .where(
          and(
            eq(productDocuments.id, params.docId),
            eq(productDocuments.productId, params.productId)
          )
        )
        .get();

      if (!doc) {
        throw new Response('Document not found', { status: 404 });
      }

      // Delete from R2
      if (env.KNOWLEDGE_BUCKET) {
        try {
          await env.KNOWLEDGE_BUCKET.delete(doc.r2Key);
        } catch (err) {
          console.error('Failed to delete from R2:', err);
        }
      }

      // Delete from database
      await store.db
        .delete(productDocuments)
        .where(eq(productDocuments.id, params.docId));

      return { success: true };
    })

    // Get document download URL (presigned)
    .get('/admin/products/:productId/documents/:docId/download', async ({ store, params }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      await assertProductAccess(store, env, user.id, params.productId);

      const doc = await store.db
        .select()
        .from(productDocuments)
        .where(
          and(
            eq(productDocuments.id, params.docId),
            eq(productDocuments.productId, params.productId)
          )
        )
        .get();

      if (!doc) {
        throw new Response('Document not found', { status: 404 });
      }

      if (!env.KNOWLEDGE_BUCKET) {
        throw new Response('R2 bucket not configured', { status: 500 });
      }

      // Get file from R2 and return it
      const object = await env.KNOWLEDGE_BUCKET.get(doc.r2Key);
      if (!object) {
        throw new Response('File not found in storage', { status: 404 });
      }

      return new Response(object.body, {
        headers: {
          'Content-Type': doc.mimeType,
          'Content-Disposition': `attachment; filename="${doc.filename}"`,
          'Content-Length': String(doc.sizeBytes)
        }
      });
    })

    // ==================== Product Knowledge ====================

    // List knowledge entries for a product
    .get('/admin/products/:productId/knowledge', async ({ store, params }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      await assertProductAccess(store, env, user.id, params.productId);

      const entries = await store.db
        .select()
        .from(productKnowledge)
        .where(eq(productKnowledge.productId, params.productId))
        .all();

      return { data: entries };
    })

    // Create knowledge entry
    .post(
      '/admin/products/:productId/knowledge',
      async ({ store, params, body }) => {
        const user = store.decorator.user;
        if (!user?.id) throw new Response('Unauthorized', { status: 401 });

        await assertProductAccess(store, env, user.id, params.productId);

        const id = nanoid();
        const now = new Date().toISOString();

        await store.db.insert(productKnowledge).values({
          id,
          productId: params.productId,
          title: body.title,
          content: body.content,
          knowledgeType: body.knowledgeType as KnowledgeType,
          vectorizeIds: null,
          createdAt: now,
          updatedAt: now
        });

        return { id, success: true };
      },
      { body: KnowledgeBody }
    )

    // Update knowledge entry
    .patch(
      '/admin/products/:productId/knowledge/:knowledgeId',
      async ({ store, params, body }) => {
        const user = store.decorator.user;
        if (!user?.id) throw new Response('Unauthorized', { status: 401 });

        await assertProductAccess(store, env, user.id, params.productId);

        const existing = await store.db
          .select()
          .from(productKnowledge)
          .where(
            and(
              eq(productKnowledge.id, params.knowledgeId),
              eq(productKnowledge.productId, params.productId)
            )
          )
          .get();

        if (!existing) {
          throw new Response('Knowledge entry not found', { status: 404 });
        }

        const updates: Record<string, any> = {
          updatedAt: new Date().toISOString()
        };

        if (body.title !== undefined) updates.title = body.title;
        if (body.content !== undefined) updates.content = body.content;
        if (body.knowledgeType !== undefined) updates.knowledgeType = body.knowledgeType;

        await store.db
          .update(productKnowledge)
          .set(updates)
          .where(eq(productKnowledge.id, params.knowledgeId));

        return { success: true };
      },
      { body: KnowledgeUpdateBody }
    )

    // Delete knowledge entry
    .delete('/admin/products/:productId/knowledge/:knowledgeId', async ({ store, params }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      await assertProductAccess(store, env, user.id, params.productId);

      const existing = await store.db
        .select()
        .from(productKnowledge)
        .where(
          and(
            eq(productKnowledge.id, params.knowledgeId),
            eq(productKnowledge.productId, params.productId)
          )
        )
        .get();

      if (!existing) {
        throw new Response('Knowledge entry not found', { status: 404 });
      }

      await store.db
        .delete(productKnowledge)
        .where(eq(productKnowledge.id, params.knowledgeId));

      return { success: true };
    });
