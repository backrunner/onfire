import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { resolveContext } from '../../../core/context';
import { assertPermission } from '@onfire/shared/rbac';
import { aiConfigs, type AIProvider, type AITaskType } from '@onfire/shared/drizzle/schema';
import { AI_PROVIDERS, AI_TASK_TYPES, createAIClient, getModelId } from '../../../services/ai/providers';
import type { Bindings } from '../../../core/types';

export const getMeta = async (env: Bindings, store: any, user: any) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'tenant.manage');

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
};

export const listConfigs = async (env: Bindings, store: any, user: any) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'tenant.manage');

  const configs = await store.db.select().from(aiConfigs).all();
  return configs.map((config: any) => ({
    ...config,
    apiKey: config.apiKey ? `${config.apiKey.slice(0, 8)}...${config.apiKey.slice(-4)}` : ''
  }));
};

export const createConfig = async (
  env: Bindings,
  store: any,
  user: any,
  body: { taskType: string; provider: string; model: string; apiKey: string; baseUrl?: string; enabled?: boolean }
) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'tenant.manage');

  const now = new Date().toISOString();
  const id = nanoid();

  const existing = await store.db
    .select()
    .from(aiConfigs)
    .where(eq(aiConfigs.taskType, body.taskType as AITaskType))
    .get();

  if (existing) {
    throw new Response(`Configuration for task type "${body.taskType}" already exists`, { status: 409 });
  }

  await store.db.insert(aiConfigs).values({
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

  return { id, success: true };
};

export const updateConfig = async (
  env: Bindings,
  store: any,
  user: any,
  id: string,
  body: { provider?: string; model?: string; apiKey?: string; baseUrl?: string; enabled?: boolean }
) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'tenant.manage');

  const existing = await store.db.select().from(aiConfigs).where(eq(aiConfigs.id, id)).get();
  if (!existing) throw new Response('AI configuration not found', { status: 404 });

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.provider !== undefined) updates.provider = body.provider;
  if (body.model !== undefined) updates.model = body.model;
  if (body.apiKey !== undefined) updates.apiKey = body.apiKey;
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  await store.db.update(aiConfigs).set(updates).where(eq(aiConfigs.id, id));
  return { success: true };
};

export const deleteConfig = async (env: Bindings, store: any, user: any, id: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'tenant.manage');

  const existing = await store.db.select().from(aiConfigs).where(eq(aiConfigs.id, id)).get();
  if (!existing) throw new Response('AI configuration not found', { status: 404 });

  await store.db.delete(aiConfigs).where(eq(aiConfigs.id, id));
  return { success: true };
};

export const testConfig = async (env: Bindings, store: any, user: any, id: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'tenant.manage');

  const config = await store.db.select().from(aiConfigs).where(eq(aiConfigs.id, id)).get();
  if (!config) throw new Response('AI configuration not found', { status: 404 });

  try {
    const client = createAIClient(config);
    const modelId = getModelId(config);
    return {
      success: true,
      message: `Successfully connected to ${AI_PROVIDERS[config.provider as AIProvider].name} with model ${modelId}`
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection test failed'
    };
  }
};
