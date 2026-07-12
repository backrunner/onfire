/**
 * AI Configuration Management
 */

import type { Database } from "@/lib/db";
import { aiConfigs } from "@/drizzle/schema";
import type {
  AITaskType,
  AIProvider as AIProviderType,
  OpenAIApiMode,
} from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { createProvider, type AIProvider, type ProviderConfig } from "./providers";
import { openStoredSecret, sealSecret } from "@/lib/secret-storage";
import { getEnv } from "@/lib/db";
import { safeAIBaseUrl } from "@/lib/ai-config";

export interface AIConfig {
  taskType: AITaskType;
  provider: AIProviderType;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
  apiMode: OpenAIApiMode;
  enabled: boolean;
}

export const AI_CONFIG_SECRET_PURPOSE = (taskType: AITaskType) =>
  `ai-config:${taskType}`;

function normalizeAIBaseUrl(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  return safeAIBaseUrl(value);
}

export async function getAIConfig(
  db: Database,
  taskType: AITaskType
): Promise<AIConfig | null> {
  const config = await db.query.aiConfigs.findFirst({
    where: eq(aiConfigs.taskType, taskType),
  });

  if (!config || !config.enabled) {
    return null;
  }

  let apiKey: string;
  try {
    apiKey = await openStoredSecret(
      config.apiKey,
      getEnv().AUTH_SECRET,
      AI_CONFIG_SECRET_PURPOSE(taskType)
    );
  } catch (error) {
    console.error(`Failed to open AI credential for ${taskType}:`, error);
    return null;
  }

  const baseUrl = normalizeAIBaseUrl(config.baseUrl);
  if (config.baseUrl && !baseUrl) {
    console.error(`Rejected unsafe AI base URL for ${taskType}`);
    return null;
  }

  return {
    taskType: config.taskType,
    provider: config.provider,
    model: config.model,
    apiKey,
    baseUrl,
    apiMode: config.apiMode,
    enabled: config.enabled ?? true,
  };
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
    apiMode: config.apiMode,
  };

  return createProvider(providerConfig);
}

export function clearConfigCache(taskType?: AITaskType): void {
  // Kept as a compatibility no-op for callers. Configuration is read from
  // D1 on each request so one isolate cannot retain stale credentials after
  // an admin update made on another isolate.
  void taskType;
}

export async function saveAIConfig(
  db: Database,
  config: Omit<AIConfig, "enabled"> & { enabled?: boolean }
): Promise<void> {
  const baseUrl = normalizeAIBaseUrl(config.baseUrl);
  if (config.baseUrl && !baseUrl) {
    throw new Error("AI base URL must be a public HTTPS URL on port 443");
  }
  const now = new Date().toISOString();
  const existing = await db.query.aiConfigs.findFirst({
    where: eq(aiConfigs.taskType, config.taskType),
  });
  const sealedApiKey = await sealSecret(
    config.apiKey,
    getEnv().AUTH_SECRET,
    AI_CONFIG_SECRET_PURPOSE(config.taskType)
  );

  if (existing) {
    await db
      .update(aiConfigs)
      .set({
        provider: config.provider,
        model: config.model,
        apiKey: sealedApiKey,
        baseUrl,
        apiMode: config.apiMode,
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
      apiKey: sealedApiKey,
      baseUrl,
      apiMode: config.apiMode,
      enabled: config.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
  }

  clearConfigCache(config.taskType);
}
