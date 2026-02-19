/**
 * AI Configuration Management
 */

import type { Database } from "@/lib/db";
import { aiConfigs } from "@/drizzle/schema";
import type { AITaskType, AIProvider as AIProviderType } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { createProvider, type AIProvider, type ProviderConfig } from "./providers";

export interface AIConfig {
  taskType: AITaskType;
  provider: AIProviderType;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
  enabled: boolean;
}

const configCache = new Map<AITaskType, AIConfig>();

export async function getAIConfig(
  db: Database,
  taskType: AITaskType
): Promise<AIConfig | null> {
  // Check cache first
  const cached = configCache.get(taskType);
  if (cached) {
    return cached;
  }

  const config = await db.query.aiConfigs.findFirst({
    where: eq(aiConfigs.taskType, taskType),
  });

  if (!config || !config.enabled) {
    return null;
  }

  const result: AIConfig = {
    taskType: config.taskType,
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    enabled: config.enabled ?? true,
  };

  configCache.set(taskType, result);
  return result;
}

export async function getAIProvider(
  db: Database,
  taskType: AITaskType
): Promise<AIProvider | null> {
  const config = await getAIConfig(db, taskType);
  if (!config) {
    return null;
  }

  const providerConfig: ProviderConfig = {
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  };

  return createProvider(providerConfig);
}

export function clearConfigCache(taskType?: AITaskType): void {
  if (taskType) {
    configCache.delete(taskType);
  } else {
    configCache.clear();
  }
}

export async function saveAIConfig(
  db: Database,
  config: Omit<AIConfig, "enabled"> & { enabled?: boolean }
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.query.aiConfigs.findFirst({
    where: eq(aiConfigs.taskType, config.taskType),
  });

  if (existing) {
    await db
      .update(aiConfigs)
      .set({
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        enabled: config.enabled ?? true,
        updatedAt: now,
      })
      .where(eq(aiConfigs.taskType, config.taskType));
  } else {
    await db.insert(aiConfigs).values({
      id: crypto.randomUUID(),
      taskType: config.taskType,
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      enabled: config.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
  }

  clearConfigCache(config.taskType);
}
