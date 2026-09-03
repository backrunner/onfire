import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  aiUsageDaily,
  aiUsageEvents,
  aiUsageSettings,
  products,
  type AITaskType,
  type AIProvider,
  type AIUsageDimension,
} from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import {
  type AIRuntimeContext,
  type AIScope,
  type AIScopeRef,
  aiScopeKey,
  resolveAiScopeChain,
  usageDailyBucketKey,
} from "@/lib/ai-scope";

export interface AIUsageRecordInput {
  credentialId: string;
  taskType: AITaskType;
  tenantId?: string | null;
  productId?: string | null;
  model: string;
  provider: AIProvider;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  success: boolean;
}

function utcDay(iso = new Date().toISOString()): string {
  return iso.slice(0, 10);
}

export async function recordAiUsage(
  db: Database,
  input: AIUsageRecordInput
): Promise<void> {
  const now = new Date().toISOString();
  const day = utcDay(now);
  const eventId = crypto.randomUUID();
  const tenantId = input.tenantId ?? null;
  const productId = input.productId ?? null;

  const dailyRows = [
    {
      dimension: "system" as const,
      tenantId: null,
      productId: null,
    },
    ...(tenantId
      ? [{ dimension: "tenant" as const, tenantId, productId: null }]
      : []),
    ...(productId
      ? [{ dimension: "product" as const, tenantId, productId }]
      : []),
  ].map((bucket) => {
    const bucketKey = usageDailyBucketKey({
      day,
      dimension: bucket.dimension,
      tenantId: bucket.tenantId,
      productId: bucket.productId,
      credentialId: input.credentialId,
      taskType: input.taskType,
    });
    return {
      id: crypto.randomUUID(),
      bucketKey,
      day,
      dimension: bucket.dimension,
      tenantId: bucket.tenantId,
      productId: bucket.productId,
      credentialId: input.credentialId,
      taskType: input.taskType,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      requestCount: 1,
      updatedAt: now,
    };
  });

  const statements = [
    db.insert(aiUsageEvents).values({
      id: eventId,
      credentialId: input.credentialId,
      taskType: input.taskType,
      tenantId,
      productId,
      model: input.model,
      provider: input.provider,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      success: input.success,
      createdAt: now,
    }),
    ...dailyRows.map((row) =>
      db
        .insert(aiUsageDaily)
        .values(row)
        .onConflictDoUpdate({
          target: aiUsageDaily.bucketKey,
          set: {
            promptTokens: sql`${aiUsageDaily.promptTokens} + ${row.promptTokens}`,
            completionTokens: sql`${aiUsageDaily.completionTokens} + ${row.completionTokens}`,
            totalTokens: sql`${aiUsageDaily.totalTokens} + ${row.totalTokens}`,
            requestCount: sql`${aiUsageDaily.requestCount} + 1`,
            updatedAt: now,
          },
        })
    ),
  ];

  await db.batch(statements as [typeof statements[0], ...typeof statements]);
}

export async function resolveUsageRetentionDays(
  db: Database,
  context: AIRuntimeContext
): Promise<number | null> {
  const chain = await resolveAiScopeChain(db, context);
  for (const scopeKey of chain) {
    const row = await db.query.aiUsageSettings.findFirst({
      where: eq(aiUsageSettings.scopeKey, scopeKey),
    });
    if (!row) continue;
    return row.retentionDays;
  }
  return null;
}

export async function getUsageSettings(db: Database, ref: AIScopeRef) {
  const scopeKey = aiScopeKey(ref);
  const row = await db.query.aiUsageSettings.findFirst({
    where: eq(aiUsageSettings.scopeKey, scopeKey),
  });
  const inherited = await resolveUsageRetentionDays(db, {
    tenantId: ref.tenantId,
    productId: ref.productId,
  });
  return {
    scopeKey,
    inherit: !row && ref.scope !== "system",
    retentionDays: row ? row.retentionDays : inherited,
    configured: Boolean(row),
  };
}

export async function saveUsageSettings(
  db: Database,
  ref: AIScopeRef,
  input: { inherit?: boolean; retentionDays?: number | null }
): Promise<void> {
  const scopeKey = aiScopeKey(ref);
  const now = new Date().toISOString();
  if (ref.scope !== "system" && input.inherit) {
    await db.delete(aiUsageSettings).where(eq(aiUsageSettings.scopeKey, scopeKey));
    return;
  }
  const retentionDays =
    input.retentionDays === undefined ? null : input.retentionDays;
  await db
    .insert(aiUsageSettings)
    .values({
      scopeKey,
      retentionDays,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiUsageSettings.scopeKey,
      set: { retentionDays, updatedAt: now },
    });
}

export async function listUsageDaily(
  db: Database,
  query: {
    dimension: AIUsageDimension;
    from: string;
    to: string;
    tenantId?: string | null;
    productId?: string | null;
    credentialId?: string | null;
  }
) {
  const filters = [
    eq(aiUsageDaily.dimension, query.dimension),
    gte(aiUsageDaily.day, query.from),
    lte(aiUsageDaily.day, query.to),
  ];
  if (query.dimension === "tenant" && query.tenantId) {
    filters.push(eq(aiUsageDaily.tenantId, query.tenantId));
  }
  if (query.dimension === "product" && query.productId) {
    filters.push(eq(aiUsageDaily.productId, query.productId));
  }
  if (query.credentialId) {
    filters.push(eq(aiUsageDaily.credentialId, query.credentialId));
  }
  return db
    .select()
    .from(aiUsageDaily)
    .where(and(...filters))
    .orderBy(aiUsageDaily.day);
}

function cutoffIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function purgeExpiredAiUsage(db: Database): Promise<number> {
  const [settings, productRows] = await Promise.all([
    db.select().from(aiUsageSettings),
    db.select({ id: products.id, tenantId: products.tenantId }).from(products),
  ]);
  const settingByKey = new Map(
    settings.map((row) => [row.scopeKey, row.retentionDays] as const)
  );
  const resolveDays = (productId: string | null, tenantId: string | null) => {
    if (productId && settingByKey.has(`product:${productId}`)) {
      return settingByKey.get(`product:${productId}`) ?? null;
    }
    if (tenantId && settingByKey.has(`tenant:${tenantId}`)) {
      return settingByKey.get(`tenant:${tenantId}`) ?? null;
    }
    return settingByKey.has("system") ? settingByKey.get("system") ?? null : null;
  };

  let deleted = 0;
  for (const product of productRows) {
    const days = resolveDays(product.id, product.tenantId);
    if (days == null || days <= 0) continue;
    const cutoff = cutoffIso(days);
    await db
      .delete(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.productId, product.id),
          sql`${aiUsageEvents.createdAt} < ${cutoff}`
        )
      );
    await db
      .delete(aiUsageDaily)
      .where(
        and(
          eq(aiUsageDaily.productId, product.id),
          sql`${aiUsageDaily.day} < ${cutoff.slice(0, 10)}`
        )
      );
    deleted += 1;
  }

  const tenantIds = [...new Set(productRows.map((row) => row.tenantId))];
  for (const tenantId of tenantIds) {
    const days = resolveDays(null, tenantId);
    if (days == null || days <= 0) continue;
    const cutoff = cutoffIso(days);
    await db
      .delete(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.tenantId, tenantId),
          sql`${aiUsageEvents.productId} is null`,
          sql`${aiUsageEvents.createdAt} < ${cutoff}`
        )
      );
  }

  const systemDays = resolveDays(null, null);
  if (systemDays != null && systemDays > 0) {
    const cutoff = cutoffIso(systemDays);
    await db
      .delete(aiUsageEvents)
      .where(
        and(
          sql`${aiUsageEvents.tenantId} is null`,
          sql`${aiUsageEvents.productId} is null`,
          sql`${aiUsageEvents.createdAt} < ${cutoff}`
        )
      );
    await db
      .delete(aiUsageDaily)
      .where(
        and(
          eq(aiUsageDaily.dimension, "system"),
          sql`${aiUsageDaily.day} < ${cutoff.slice(0, 10)}`
        )
      );
  }

  return deleted;
}
