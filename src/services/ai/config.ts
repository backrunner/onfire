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
  isProviderAllowedForTask,
  modelKindForTask,
  safeAIBaseUrl,
  EMBEDDING_DIMENSIONS,
  type AIModelKind,
} from "@/lib/ai-config";
import {
  type AIRuntimeContext,
  resolveAiScopeChain,
} from "@/lib/ai-scope";
import { recordAiUsage } from "./usage";
import { getVectorDimensions, vectorSpaceKey } from "./vector-space";

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
  blockedUntil: string | null;
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
      provider: aiCredentials.provider,
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
      isProviderAllowedForTask(taskType, row.provider) &&
      kind === modelKindForTask(taskType) &&
      (kind !== "embedding" || (row.modelDimensions !== null && row.modelDimensions > 0));
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
    .orderBy(
      asc(aiTaskCredentials.priority),
      // Model identity must not rotate after a successful call when legacy
      // routes contain tied priorities and different embedding models.
      taskType === "embedding" ? asc(aiTaskCredentials.id) : asc(aiCredentials.lastUsedAt),
    );

  const now = Date.now();
  return rows
    .filter(
      (row) =>
        row.taskEnabled &&
        row.routeEnabled &&
        row.credentialEnabled &&
        isProviderAllowedForTask(taskType, row.provider) &&
        (taskType === "embedding" || !row.blockedUntil || Date.parse(row.blockedUntil) <= now)
    )
    .map((row) => {
      const modelKind = row.modelKind ?? classifyAIModel(row.model);
      if (modelKind !== modelKindForTask(taskType)) return null;
      if (modelKind === "embedding" && (!row.modelDimensions || row.modelDimensions < 1)) return null;
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
        blockedUntil: row.blockedUntil,
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
    embeddingDimensions: candidate.modelDimensions ?? undefined,
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
    private readonly context: AIRuntimeContext,
    public readonly embeddingSpace?: string,
    private readonly embeddingDimensions = EMBEDDING_DIMENSIONS,
  ) {}

  complete(options: AICompletionOptions): Promise<AICompletionResult> {
    return this.execute(async (provider) => {
      const result = await provider.complete(options);
      options.validateResult?.(result);
      return result;
    });
  }

  embed(
    text: string,
    options?: AIEmbeddingOptions
  ): Promise<AIEmbeddingResult> {
    return this.execute(async (provider) => {
      const result = await provider.embed(text, options);
      if (!Array.isArray(result.embedding) ||
        result.embedding.length !== this.embeddingDimensions ||
        !result.embedding.every((value) => typeof value === "number" && Number.isFinite(value))) {
        throw new Error(`Invalid embedding: expected ${this.embeddingDimensions} finite numbers`);
      }
      return { ...result, space: this.embeddingSpace };
    });
  }

  rerank(options: AIRerankOptions): Promise<AIRerankResult> {
    return this.execute(async (provider) => {
      if (!provider.rerank) throw new Error(`${provider.name} does not support reranking`);
      const result = await provider.rerank(options);
      const seen = new Set<number>();
      if (!Array.isArray(result.results) ||
        (options.documents.length > 0 && result.results.length === 0) ||
        !result.results.every((item) => {
          if (!Number.isInteger(item.index) || item.index < 0 ||
            item.index >= options.documents.length || seen.has(item.index) ||
            !Number.isFinite(item.relevanceScore)) return false;
          seen.add(item.index);
          return true;
        })) {
        throw new Error("Invalid rerank response");
      }
      return result;
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
        try {
          await recordFailure(this.db, candidate, error, hasFallback);
        } catch (recordError) {
          console.error("Failed to record AI credential failure:", recordError);
        }
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

export async function getAIProvider(
  db: Database,
  taskType: AITaskType,
  context: AIRuntimeContext = {}
): Promise<AIProvider | null> {
  const candidates = await listAvailableCredentials(db, taskType, context);
  if (taskType === "embedding" && candidates.length > 0) {
    const profile = await resolveEmbeddingProfile(candidates);
    const available = candidates.filter((candidate) =>
      sameEmbeddingModel(candidate, profile.primary) &&
      (!candidate.blockedUntil || Date.parse(candidate.blockedUntil) <= Date.now())
    );
    return available.length > 0
      ? new FailoverAIProvider(db, available, taskType, context, profile.space, profile.dimensions)
      : null;
  }
  return candidates.length > 0
    ? new FailoverAIProvider(db, candidates, taskType, context)
    : null;
}

function sameEmbeddingModel(left: RoutedCredential, right: RoutedCredential): boolean {
  return left.provider === right.provider && left.model === right.model &&
    normalizedBaseUrl(left.baseUrl) === normalizedBaseUrl(right.baseUrl) &&
    left.modelDimensions === right.modelDimensions;
}

async function resolveEmbeddingProfile(candidates: RoutedCredential[]) {
  const dimensions = await getVectorDimensions();
  const primary = candidates[0];
  if (primary.modelDimensions !== dimensions) {
    throw new Error(`Embedding route requests ${primary.modelDimensions} dimensions but the bound Vectorize index requires ${dimensions}; save a compatible route before rebuilding`);
  }
  const space = await vectorSpaceKey({
    provider: primary.provider, model: primary.model,
    baseUrl: normalizedBaseUrl(primary.baseUrl), dimensions,
  });
  return { primary, dimensions, space };
}

/** Cooling down a key must never silently switch the knowledge coordinate space. */
export async function getEmbeddingProfile(db: Database, context: AIRuntimeContext) {
  const candidates = await listAvailableCredentials(db, "embedding", context);
  if (candidates.length === 0) return null;
  const { primary, dimensions, space } = await resolveEmbeddingProfile(candidates);
  return { space, dimensions, model: primary.model, provider: primary.provider };
}
