import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  aiConfigs,
  aiCredentials,
  aiTaskCredentials,
  type AITaskType,
} from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { badRequest } from "@/lib/api/response";
import {
  AI_TASK_TYPES,
  isProviderAllowedForTask,
} from "@/lib/ai-config";
import {
  type AIScope,
  type AIScopeRef,
  aiScopeKey,
  fillAiScopeRef,
  parseAiScopeKey,
  resolveAiScopeChain,
} from "@/lib/ai-scope";

const assignmentSchema = z.object({
  credentialId: z.string().min(1),
  model: z.string().trim().min(1).max(200),
  enabled: z.boolean().optional(),
});

const assignmentsSchema = z
  .array(assignmentSchema)
  .max(20)
  .refine(
    (items) => new Set(items.map((item) => item.credentialId)).size === items.length,
    { message: "A credential can only be assigned once per task" }
  );

export const taskRoutingSchema = z.object({
  taskType: z.enum(AI_TASK_TYPES),
  enabled: z.boolean(),
  inherit: z.boolean().optional(),
  assignments: assignmentsSchema,
});

export const taskRoutingUpdateSchema = taskRoutingSchema.omit({ taskType: true });

export type TaskAssignmentInput = z.infer<typeof assignmentSchema>;

const assignmentSelect = {
  id: aiTaskCredentials.id,
  taskType: aiTaskCredentials.taskType,
  credentialId: aiTaskCredentials.credentialId,
  model: aiTaskCredentials.model,
  priority: aiTaskCredentials.priority,
  enabled: aiTaskCredentials.enabled,
  credentialName: aiCredentials.name,
  provider: aiCredentials.provider,
  credentialEnabled: aiCredentials.enabled,
  blockedUntil: aiCredentials.blockedUntil,
  credentialScope: aiCredentials.scope,
};

async function loadScopeAssignments(db: Database, scopeKey: string, taskType: AITaskType) {
  return db
    .select(assignmentSelect)
    .from(aiTaskCredentials)
    .innerJoin(
      aiCredentials,
      eq(aiTaskCredentials.credentialId, aiCredentials.id)
    )
    .where(
      and(
        eq(aiTaskCredentials.scopeKey, scopeKey),
        eq(aiTaskCredentials.taskType, taskType)
      )
    )
    .orderBy(asc(aiTaskCredentials.priority));
}

async function loadInheritedRoute(
  db: Database,
  ref: AIScopeRef,
  taskType: AITaskType
): Promise<{
  inheritedFrom: AIScope | null;
  inheritedEnabled: boolean;
  inheritedAssignments: Awaited<ReturnType<typeof loadScopeAssignments>>;
}> {
  if (ref.scope === "system") {
    return { inheritedFrom: null, inheritedEnabled: true, inheritedAssignments: [] };
  }
  const chain = await resolveAiScopeChain(db, {
    tenantId: ref.tenantId,
    productId: ref.productId,
  });
  for (const scopeKey of chain.slice(1)) {
    const config = await db.query.aiConfigs.findFirst({
      where: and(eq(aiConfigs.scopeKey, scopeKey), eq(aiConfigs.taskType, taskType)),
    });
    if (!config || config.inherit) continue;
    return {
      inheritedFrom: parseAiScopeKey(scopeKey).scope,
      inheritedEnabled: config.enabled,
      inheritedAssignments: await loadScopeAssignments(db, scopeKey, taskType),
    };
  }
  return {
    inheritedFrom: "system",
    inheritedEnabled: true,
    inheritedAssignments: [],
  };
}

export async function listTaskRouting(db: Database, ref: AIScopeRef) {
  const filled = await fillAiScopeRef(db, ref);
  const scopeKey = aiScopeKey(filled);
  const [configs, routes] = await Promise.all([
    db.select().from(aiConfigs).where(eq(aiConfigs.scopeKey, scopeKey)),
    db
      .select(assignmentSelect)
      .from(aiTaskCredentials)
      .innerJoin(
        aiCredentials,
        eq(aiTaskCredentials.credentialId, aiCredentials.id)
      )
      .where(eq(aiTaskCredentials.scopeKey, scopeKey))
      .orderBy(asc(aiTaskCredentials.taskType), asc(aiTaskCredentials.priority)),
  ]);

  return Promise.all(
    AI_TASK_TYPES.map(async (taskType) => {
      const config = configs.find((item) => item.taskType === taskType);
      const inherited = await loadInheritedRoute(db, filled, taskType);
      return {
        id: config?.id ?? null,
        scopeKey,
        taskType,
        enabled: config?.enabled ?? true,
        inherit: config?.inherit ?? ref.scope !== "system",
        assignments: routes.filter((route) => route.taskType === taskType),
        ...inherited,
      };
    })
  );
}

async function assertAssignableCredentials(
  db: Database,
  ref: AIScopeRef,
  taskType: AITaskType,
  assignments: TaskAssignmentInput[]
) {
  const filled = await fillAiScopeRef(db, ref);
  const credentialIds = assignments.map((assignment) => assignment.credentialId);
  if (credentialIds.length === 0) return;
  const credentials = await db
    .select({
      id: aiCredentials.id,
      provider: aiCredentials.provider,
      scope: aiCredentials.scope,
      tenantId: aiCredentials.tenantId,
      productId: aiCredentials.productId,
    })
    .from(aiCredentials)
    .where(inArray(aiCredentials.id, credentialIds));
  if (credentials.length !== credentialIds.length) {
    throw badRequest("One or more AI credentials do not exist");
  }
  for (const credential of credentials) {
    if (!isProviderAllowedForTask(taskType, credential.provider)) {
      throw badRequest("Credential provider is not supported for this AI task");
    }
    const allowed =
      credential.scope === "system" ||
      (filled.scope !== "system" &&
        credential.scope === "tenant" &&
        credential.tenantId === filled.tenantId) ||
      (filled.scope === "product" &&
        credential.scope === "product" &&
        credential.productId === filled.productId);
    if (!allowed) {
      throw badRequest("Credential is outside the inheritable scope");
    }
  }
}

export async function saveTaskRouting(
  db: Database,
  taskType: AITaskType,
  enabled: boolean,
  assignments: TaskAssignmentInput[],
  ref: AIScopeRef = { scope: "system" },
  inherit = false
): Promise<void> {
  const filled = await fillAiScopeRef(db, ref);
  const scopeKey = aiScopeKey(filled);
  if (scopeKey === "system" && inherit) {
    throw badRequest("System AI routing cannot inherit");
  }
  if (!inherit && enabled && assignments.filter((assignment) => assignment.enabled ?? true).length === 0) {
    throw badRequest("An enabled AI task requires at least one credential");
  }
  if (!inherit) {
    await assertAssignableCredentials(db, filled, taskType, assignments);
  }

  const now = new Date().toISOString();
  const existing = await db.query.aiConfigs.findFirst({
    where: and(eq(aiConfigs.scopeKey, scopeKey), eq(aiConfigs.taskType, taskType)),
  });
  const nextAssignments = inherit ? [] : assignments;
  const statements: BatchItem<"sqlite">[] = [
    existing
      ? db
          .update(aiConfigs)
          .set({ enabled, inherit, updatedAt: now })
          .where(eq(aiConfigs.id, existing.id))
      : db.insert(aiConfigs).values({
          id: crypto.randomUUID(),
          scopeKey,
          taskType,
          enabled,
          inherit,
          createdAt: now,
          updatedAt: now,
        }),
    db
      .delete(aiTaskCredentials)
      .where(
        and(
          eq(aiTaskCredentials.scopeKey, scopeKey),
          eq(aiTaskCredentials.taskType, taskType)
        )
      ),
  ];

  nextAssignments.forEach((assignment, priority) => {
    statements.push(
      db.insert(aiTaskCredentials).values({
        id: crypto.randomUUID(),
        scopeKey,
        taskType,
        credentialId: assignment.credentialId,
        model: assignment.model,
        priority,
        enabled: assignment.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      })
    );
  });

  await db.batch(
    statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
  );
}

export async function deleteTaskRouting(
  db: Database,
  taskType: AITaskType,
  ref: AIScopeRef = { scope: "system" }
): Promise<void> {
  const scopeKey = aiScopeKey(await fillAiScopeRef(db, ref));
  await db.batch([
    db
      .delete(aiTaskCredentials)
      .where(
        and(
          eq(aiTaskCredentials.scopeKey, scopeKey),
          eq(aiTaskCredentials.taskType, taskType)
        )
      ),
    db
      .delete(aiConfigs)
      .where(and(eq(aiConfigs.scopeKey, scopeKey), eq(aiConfigs.taskType, taskType))),
  ]);
}
