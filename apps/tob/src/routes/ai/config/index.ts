import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { assertPermission } from '@onfire/shared/rbac';
import { aiConfigs, type AIProvider, type AITaskType } from '@onfire/shared/drizzle/schema';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { AI_PROVIDERS, AI_TASK_TYPES, createAIClient, getModelId } from '../../../services/ai/providers';
import { ok } from '../../../core/response';

export const aiConfigRoutes = () => {
  const router = createRouter();

  // GET /admin/ai-config/meta
  router.get('/admin/ai-config/meta', async (c) => {
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'tenant.manage');

    return c.json(ok({
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
    }));
  });

  // GET /admin/ai-config
  router.get('/admin/ai-config', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'tenant.manage');

    const configs = await db.select().from(aiConfigs).all();
    return c.json(ok(configs.map((config: any) => ({
      ...config,
      apiKey: config.apiKey ? `${config.apiKey.slice(0, 8)}...${config.apiKey.slice(-4)}` : ''
    }))));
  });

  // POST /admin/ai-config
  router.post('/admin/ai-config', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'tenant.manage');

    const body = await c.req.json<{ taskType: string; provider: string; model: string; apiKey: string; baseUrl?: string; enabled?: boolean }>();
    const now = new Date().toISOString();
    const id = nanoid();

    const existing = await db
      .select()
      .from(aiConfigs)
      .where(eq(aiConfigs.taskType, body.taskType as AITaskType))
      .get();

    if (existing) {
      throw new Response(`Configuration for task type "${body.taskType}" already exists`, { status: 409 });
    }

    await db.insert(aiConfigs).values({
      id,
      taskType: body.taskType as AITaskType,
      provider: body.provider as AIProvider,
      model: body.model,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl || null,
      enabled: body.enabled ?? true,
      createdAt: now,
      updatedAt: now
    });

    return c.json(ok({ id, success: true }));
  });

  // PATCH /admin/ai-config/:id
  router.patch('/admin/ai-config/:id', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'tenant.manage');

    const id = c.req.param('id');
    const body = await c.req.json<{ provider?: string; model?: string; apiKey?: string; baseUrl?: string; enabled?: boolean }>();

    const existing = await db.select().from(aiConfigs).where(eq(aiConfigs.id, id)).get();
    if (!existing) throw new Response('AI configuration not found', { status: 404 });

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (body.provider !== undefined) updates.provider = body.provider;
    if (body.model !== undefined) updates.model = body.model;
    if (body.apiKey !== undefined) updates.apiKey = body.apiKey;
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    await db.update(aiConfigs).set(updates).where(eq(aiConfigs.id, id));
    return c.json(ok({ success: true }));
  });

  // DELETE /admin/ai-config/:id
  router.delete('/admin/ai-config/:id', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'tenant.manage');

    const id = c.req.param('id');
    const existing = await db.select().from(aiConfigs).where(eq(aiConfigs.id, id)).get();
    if (!existing) throw new Response('AI configuration not found', { status: 404 });

    await db.delete(aiConfigs).where(eq(aiConfigs.id, id));
    return c.json(ok({ success: true }));
  });

  // POST /admin/ai-config/:id/test
  router.post('/admin/ai-config/:id/test', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'tenant.manage');

    const id = c.req.param('id');
    const config = await db.select().from(aiConfigs).where(eq(aiConfigs.id, id)).get();
    if (!config) throw new Response('AI configuration not found', { status: 404 });

    try {
      const client = createAIClient(config);
      const modelId = getModelId(config);
      return c.json(ok({
        success: true,
        message: `Successfully connected to ${AI_PROVIDERS[config.provider as AIProvider].name} with model ${modelId}`
      }));
    } catch (error) {
      return c.json(ok({
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed'
      }));
    }
  });

  return router;
};
