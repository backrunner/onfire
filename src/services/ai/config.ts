/**
 * AI credential routing and runtime failover.
 */

import type { Database } from "@/lib/db";
import {
  aiConfigs,
  aiCredentials,
  aiTaskCredentials,
  type AITaskType,
  type AIProvider as AIProviderType,
  type OpenAIApiMode,
} from "@/drizzle/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  createProvider,
  type AICompletionOptions,
  type AICompletionResult,
  type AIEmbeddingOptions,
  type AIEmbeddingResult,
  type AIRerankOptions,
  type AIRerankResult,
  type AIProvider,
  type ProviderConfig,
} from "./providers";
import { openStoredSecret } from "@/lib/secret-storage";
import { getEnv } from "@/lib/db";
import {
  classifyAIModel,
  modelKindForTask,
  safeAIBaseUrl,
  type AIModelKind,
} from "@/lib/ai-config";
import {
  type AIRuntimeContext,
  resolveAiScopeChain,
} from "@/lib/ai-scope";
import { recordAiUsage } from "./usage";

export const AI_CREDENTIAL_SECRET_PURPOSE = (credentialId: string) =>
  `ai-credential:${credentialId}`;

export interface RoutedCredential {
  id: string;
  name: string;
  provider: AIProviderType;
  apiMode: OpenAIApiMode;
  encryptedApiKey: string;
  secretPurpose: string;
  baseUrl: string | null;
  model: string;
  modelKind: AIModelKind;
  modelDimensions: number | null;
  priority: number;
  cooldownSeconds: number;
}

export interface AIConfig {
  taskType: AITaskType;
  credentialId: string;
  credentialName: string;
  provider: AIProviderType;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
  apiMode: OpenAIApiMode;
  enabled: boolean;
}

function normalizedBaseUrl(value: string | null): string | null {
  if (!value) return null;
  return safeAIBaseUrl(value);
}

export async function resolveEffectiveAiScopeKey(
  db: Database,
  taskType: AITaskType,
  context: AIRuntimeContext = {}
): Promise<string | null> {
  const chain = await resolveAiScopeChain(db, context);
  for (const scopeKey of chain) {
    const config = await db.query.aiConfigs.findFirst({
      where: and(eq(aiConfigs.scopeKey, scopeKey), eq(aiConfigs.taskType, taskType)),
    });
    if (!config || config.inherit) continue;
    return config.enabled ? scopeKey : null;
  }
  return "system";
}

export async function hasConfiguredAITask(
  db: Database,
  taskType: AITaskType,
  context: AIRuntimeContext = {}
): Promise<boolean> {
  const scopeKey = await resolveEffectiveAiScopeKey(db, taskType, context);
  if (!scopeKey) return false;
  const rows = await db
    .select({
      taskEnabled: aiConfigs.enabled,
      routeEnabled: aiTaskCredentials.enabled,
      credentialEnabled: aiCredentials.enabled,
      model: aiTaskCredentials.model,
      modelKind: aiTaskCredentials.modelKind,
      modelDimensions: aiTaskCredentials.modelDimensions,
    })
    .from(aiTaskCredentials)
    .innerJoin(
      aiCredentials,
      eq(aiTaskCredentials.credentialId, aiCredentials.id)
    )
    .innerJoin(
      aiConfigs,
      and(
        eq(aiTaskCredentials.taskType, aiConfigs.taskType),
        eq(aiTaskCredentials.scopeKey, aiConfigs.scopeKey)
      )
    )
    .where(
      and(
        eq(aiTaskCredentials.taskType, taskType),
        eq(aiTaskCredentials.scopeKey, scopeKey)
      )
    );

  return rows.some((row) => {
    const kind = row.modelKind ?? classifyAIModel(row.model);
    return row.taskEnabled &&
      row.routeEnabled &&
      row.credentialEnabled &&
      kind === modelKindForTask(taskType) &&
      (kind !== "embedding" || row.modelDimensions === 1024);
  });
}

async function listAvailableCredentials(
  db: Database,
  taskType: AITaskType,
  context: AIRuntimeContext = {}
): Promise<RoutedCredential[]> {
  const scopeKey = await resolveEffectiveAiScopeKey(db, taskType, context);
  if (!scopeKey) return [];
  const rows = await db
    .select({
      taskEnabled: aiConfigs.enabled,
      routeEnabled: aiTaskCredentials.enabled,
      credentialId: aiCredentials.id,
      credentialName: aiCredentials.name,
      provider: aiCredentials.provider,
      apiMode: aiCredentials.apiMode,
      encryptedApiKey: aiCredentials.apiKey,
      secretPurpose: aiCredentials.secretPurpose,
      baseUrl: aiCredentials.baseUrl,
      credentialEnabled: aiCredentials.enabled,
      blockedUntil: aiCredentials.blockedUntil,
      cooldownSeconds: aiCredentials.cooldownSeconds,
      model: aiTaskCredentials.model,
      modelKind: aiTaskCredentials.modelKind,
      modelDimensions: aiTaskCredentials.modelDimensions,
      priority: aiTaskCredentials.priority,
    })
    .from(aiTaskCredentials)
    .innerJoin(
      aiCredentials,
      eq(aiTaskCredentials.credentialId, aiCredentials.id)
    )
    .innerJoin(
      aiConfigs,
      and(
        eq(aiTaskCredentials.taskType, aiConfigs.taskType),
        eq(aiTaskCredentials.scopeKey, aiConfigs.scopeKey)
      )
    )
    .where(
      and(
        eq(aiTaskCredentials.taskType, taskType),
        eq(aiTaskCredentials.scopeKey, scopeKey)
      )
    )
    .orderBy(asc(aiTaskCredentials.priority), asc(aiCredentials.lastUsedAt));

  const now = Date.now();
  return rows
    .filter(
      (row) =>
        row.taskEnabled &&
        row.routeEnabled &&
        row.credentialEnabled &&
        (!row.blockedUntil || Date.parse(row.blockedUntil) <= now)
    )
    .map((row) => {
      const modelKind = row.modelKind ?? classifyAIModel(row.model);
      if (modelKind !== modelKindForTask(taskType)) return null;
      if (modelKind === "embedding" && row.modelDimensions !== 1024) return null;
      return {
        id: row.credentialId,
        name: row.credentialName,
        provider: row.provider,
        apiMode: row.apiMode,
        encryptedApiKey: row.encryptedApiKey,
        secretPurpose: row.secretPurpose,
        baseUrl: row.baseUrl,
        model: row.model,
        modelKind,
        modelDimensions: row.modelDimensions,
        priority: row.priority,
        cooldownSeconds: row.cooldownSeconds,
      };
    })
    .filter((row): row is RoutedCredential => row !== null);
}

async function buildProvider(candidate: RoutedCredential): Promise<AIProvider> {
  const apiKey = await openStoredSecret(
    candidate.encryptedApiKey,
    getEnv().AUTH_SECRET,
    candidate.secretPurpose
  );
  const baseUrl = normalizedBaseUrl(candidate.baseUrl);
  if (candidate.baseUrl && !baseUrl) {
    throw new Error("Credential has an unsafe AI base URL");
  }

  const providerConfig: ProviderConfig = {
    provider: candidate.provider,
    model: candidate.model,
    apiKey,
    baseUrl,
    apiMode: candidate.apiMode,
  };
  return createProvider(providerConfig);
}

async function recordSuccess(db: Database, credentialId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(aiCredentials)
    .set({
      blockedUntil: null,
      failureCount: 0,
      lastFailureMessage: null,
      lastSuccessAt: now,
      lastUsedAt: now,
      updatedAt: now,
    })
    .where(eq(aiCredentials.id, credentialId));
}

async function recordFailure(
  db: Database,
  candidate: RoutedCredential,
  error: unknown,
  hasFallback: boolean
): Promise<void> {
  const now = new Date();
  const message = error instanceof Error ? error.message : "Unknown AI provider error";
  await db
    .update(aiCredentials)
    .set({
      blockedUntil: getCredentialCooldownUntil(
        candidate.cooldownSeconds,
        hasFallback,
        now
      ),
      failureCount: sql`${aiCredentials.failureCount} + 1`,
      lastFailureAt: now.toISOString(),
      lastFailureMessage: message.slice(0, 1_000),
      lastUsedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .where(eq(aiCredentials.id, candidate.id));
}

export function getCredentialCooldownUntil(
  cooldownSeconds: number,
  hasFallback: boolean,
  now = new Date()
): string | null {
  if (!hasFallback) return null;
  return new Date(
    now.getTime() + Math.max(0, cooldownSeconds) * 1_000
  ).toISOString();
}

export async function runWithCredentialFailover<T>(
  candidates: readonly RoutedCredential[],
  operation: (candidate: RoutedCredential) => Promise<T>,
  onSuccess: (candidate: RoutedCredential) => Promise<void>,
  onFailure: (
    candidate: RoutedCredential,
    error: unknown,
    hasFallback: boolean
  ) => Promise<void>
): Promise<T> {
  let lastError: unknown = new Error("No AI credential is available");

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const hasFallback = index < candidates.length - 1;
    try {
      const result = await operation(candidate);
      try {
        await onSuccess(candidate);
      } catch (recordError) {
        // A successful provider response must not be retried just because the
        // health bookkeeping write failed; that could duplicate billable work.
        console.error("Failed to record AI credential success:", recordError);
      }
      return result;
    } catch (error) {
      lastError = error;
      try {
        await onFailure(candidate, error, hasFallback);
      } catch (recordError) {
        console.error("Failed to record AI credential health:", recordError);
      }
    }
  }

  throw lastError;
}

function usageFromResult(result: unknown): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  if (!result || typeof result !== "object" || !("usage" in result)) {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
  const usage = (result as { usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }).usage;
  const promptTokens = usage?.promptTokens ?? 0;
  const completionTokens = usage?.completionTokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage?.totalTokens ?? promptTokens + completionTokens,
  };
}

class FailoverAIProvider implements AIProvider {
  name = "credential-pool";

  constructor(
    private readonly db: Database,
    private readonly candidates: readonly RoutedCredential[],
    private readonly taskType: AITaskType,
    private readonly context: AIRuntimeContext
  ) {}

  complete(options: AICompletionOptions): Promise<AICompletionResult> {
    return this.execute((provider) => provider.complete(options));
  }

  embed(
    text: string,
    options?: AIEmbeddingOptions
  ): Promise<AIEmbeddingResult> {
    return this.execute((provider) => provider.embed(text, options));
  }

  rerank(options: AIRerankOptions): Promise<AIRerankResult> {
    return this.execute((provider) => {
      if (!provider.rerank) throw new Error(`${provider.name} does not support reranking`);
      return provider.rerank(options);
    });
  }

  private execute<T>(operation: (provider: AIProvider) => Promise<T>): Promise<T> {
    return runWithCredentialFailover(
      this.candidates,
      async (candidate) => {
        const result = await operation(await buildProvider(candidate));
        const tokens = usageFromResult(result);
        try {
          await recordAiUsage(this.db, {
            credentialId: candidate.id,
            taskType: this.taskType,
            tenantId: this.context.tenantId,
            productId: this.context.productId,
            model: candidate.model,
            provider: candidate.provider,
            promptTokens: tokens.promptTokens,
            completionTokens: tokens.completionTokens,
            totalTokens: tokens.totalTokens,
            success: true,
          });
        } catch (error) {
          console.error("Failed to record AI usage:", error);
        }
        return result;
      },
      (candidate) => recordSuccess(this.db, candidate.id),
      async (candidate, error, hasFallback) => {
        await recordFailure(this.db, candidate, error, hasFallback);
        try {
          await recordAiUsage(this.db, {
            credentialId: candidate.id,
            taskType: this.taskType,
            tenantId: this.context.tenantId,
            productId: this.context.productId,
            model: candidate.model,
            provider: candidate.provider,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            success: false,
          });
        } catch (recordError) {
          console.error("Failed to record failed AI usage:", recordError);
        }
      }
    );
  }
}

export async function getAIConfig(
  db: Database,
  taskType: AITaskType,
  context: AIRuntimeContext = {}
): Promise<AIConfig | null> {
  const candidates = await listAvailableCredentials(db, taskType, context);
  for (const candidate of candidates) {
    try {
      const apiKey = await openStoredSecret(
        candidate.encryptedApiKey,
        getEnv().AUTH_SECRET,
        candidate.secretPurpose
      );
      return {
        taskType,
        credentialId: candidate.id,
        credentialName: candidate.name,
        provider: candidate.provider,
        model: candidate.model,
        apiKey,
        baseUrl: normalizedBaseUrl(candidate.baseUrl),
        apiMode: candidate.apiMode,
        enabled: true,
      };
    } catch (error) {
      console.error(
        `Failed to open AI credential ${candidate.id} for ${taskType}:`,
        error
      );
    }
  }
  return null;
}

export async function getAIProvider(
  db: Database,
  taskType: AITaskType,
  context: AIRuntimeContext = {}
): Promise<AIProvider | null> {
  const candidates = await listAvailableCredentials(db, taskType, context);
  return candidates.length > 0
    ? new FailoverAIProvider(db, candidates, taskType, context)
    : null;
}

export function clearConfigCache(_taskType?: AITaskType): void {
  // Configuration and credential health are read from D1 on every request.
}
