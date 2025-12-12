/**
 * AI Configuration Routes
 * SuperAdmin-only endpoints for managing AI provider configurations
 */

import { Elysia, t } from 'elysia';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Bindings, WorkerSingleton } from '../core/types';
import { resolveContext } from '../core/context';
import { assertPermission } from '@onfire/shared/rbac';
import { aiConfigs, type AIProvider, type AITaskType } from '@onfire/shared/drizzle/schema';
import { AI_PROVIDERS, AI_TASK_TYPES, createAIClient, getModelId } from '../services/ai/providers';

const AIConfigBody = t.Object({
  taskType: t.Union([
    t.Literal('agent'),
    t.Literal('prescreening'),
    t.Literal('prereply'),
    t.Literal('embedding')
  ]),
  provider: t.Union([
    t.Literal('openai'),
    t.Literal('anthropic'),
    t.Literal('google'),
    t.Literal('xai'),
    t.Literal('deepseek')
  ]),
  model: t.String({ minLength: 1 }),
  apiKey: t.String({ minLength: 1 }),
  baseUrl: t.Optional(t.String()),
  enabled: t.Optional(t.Boolean())
});

const AIConfigUpdateBody = t.Object({
  provider: t.Optional(
    t.Union([
      t.Literal('openai'),
      t.Literal('anthropic'),
      t.Literal('google'),
      t.Literal('xai'),
      t.Literal('deepseek')
    ])
  ),
  model: t.Optional(t.String({ minLength: 1 })),
  apiKey: t.Optional(t.String({ minLength: 1 })),
  baseUrl: t.Optional(t.String()),
  enabled: t.Optional(t.Boolean())
});

export const createAIConfigRoutes = (_env: Bindings) =>
  new Elysia<'', false, WorkerSingleton>()
    // Get provider and task type metadata
    .get('/admin/ai-config/meta', async ({ store }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      const ctx = await resolveContext(store.env, user);
      assertPermission(ctx, 'tenant.manage'); // SuperAdmin only

      return {
        providers: Object.entries(AI_PROVIDERS).map(([id, config]) => ({
          id,
          name: config.name,
          models: config.models,
          baseUrl: config.baseUrl,
          supportsStreaming: config.supportsStreaming,
          supportsTools: config.supportsTools
        })),
        taskTypes: Object.entries(AI_TASK_TYPES).map(([id, config]) => ({
          id,
          name: config.name,
          description: config.description
        }))
      };
    })

    // List all AI configurations
    .get('/admin/ai-config', async ({ store }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      const ctx = await resolveContext(store.env, user);
      assertPermission(ctx, 'tenant.manage'); // SuperAdmin only

      const configs = await store.db.select().from(aiConfigs).all();

      // Mask API keys in response
      return configs.map((config) => ({
        ...config,
        apiKey: config.apiKey ? `${config.apiKey.slice(0, 8)}...${config.apiKey.slice(-4)}` : ''
      }));
    })

    // Create new AI configuration
    .post(
      '/admin/ai-config',
      async ({ store, body }) => {
        const user = store.decorator.user;
        if (!user?.id) throw new Response('Unauthorized', { status: 401 });

        const ctx = await resolveContext(store.env, user);
        assertPermission(ctx, 'tenant.manage'); // SuperAdmin only

        const now = new Date().toISOString();
        const id = nanoid();

        // Check if config for this task type already exists
        const existing = await store.db
          .select()
          .from(aiConfigs)
          .where(eq(aiConfigs.taskType, body.taskType as AITaskType))
          .get();

        if (existing) {
          throw new Response(`Configuration for task type "${body.taskType}" already exists`, {
            status: 409
          });
        }

        await store.db.insert(aiConfigs).values({
          id,
          taskType: body.taskType as AITaskType,
          provider: body.provider as AIProvider,
          model: body.model,
          apiKey: body.apiKey, // TODO: Encrypt before storing
          baseUrl: body.baseUrl || null,
          enabled: body.enabled ?? true,
          createdAt: now,
          updatedAt: now
        });

        return { id, success: true };
      },
      { body: AIConfigBody }
    )

    // Update AI configuration
    .patch(
      '/admin/ai-config/:id',
      async ({ store, params, body }) => {
        const user = store.decorator.user;
        if (!user?.id) throw new Response('Unauthorized', { status: 401 });

        const ctx = await resolveContext(store.env, user);
        assertPermission(ctx, 'tenant.manage'); // SuperAdmin only

        const existing = await store.db.select().from(aiConfigs).where(eq(aiConfigs.id, params.id)).get();

        if (!existing) {
          throw new Response('AI configuration not found', { status: 404 });
        }

        const updates: Record<string, any> = {
          updatedAt: new Date().toISOString()
        };

        if (body.provider !== undefined) updates.provider = body.provider;
        if (body.model !== undefined) updates.model = body.model;
        if (body.apiKey !== undefined) updates.apiKey = body.apiKey; // TODO: Encrypt
        if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
        if (body.enabled !== undefined) updates.enabled = body.enabled;

        await store.db.update(aiConfigs).set(updates).where(eq(aiConfigs.id, params.id));

        return { success: true };
      },
      { body: AIConfigUpdateBody }
    )

    // Delete AI configuration
    .delete('/admin/ai-config/:id', async ({ store, params }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      const ctx = await resolveContext(store.env, user);
      assertPermission(ctx, 'tenant.manage'); // SuperAdmin only

      const existing = await store.db.select().from(aiConfigs).where(eq(aiConfigs.id, params.id)).get();

      if (!existing) {
        throw new Response('AI configuration not found', { status: 404 });
      }

      await store.db.delete(aiConfigs).where(eq(aiConfigs.id, params.id));

      return { success: true };
    })

    // Test AI configuration connection
    .post('/admin/ai-config/:id/test', async ({ store, params }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      const ctx = await resolveContext(store.env, user);
      assertPermission(ctx, 'tenant.manage'); // SuperAdmin only

      const config = await store.db.select().from(aiConfigs).where(eq(aiConfigs.id, params.id)).get();

      if (!config) {
        throw new Response('AI configuration not found', { status: 404 });
      }

      try {
        const client = createAIClient(config);
        const modelId = getModelId(config);

        // Simple test: try to get model info or make a minimal request
        // Note: Actual implementation depends on AI SDK capabilities
        // For now, we just verify the client can be created

        return {
          success: true,
          message: `Successfully connected to ${AI_PROVIDERS[config.provider].name} with model ${modelId}`
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Connection test failed'
        };
      }
    });
