import { z } from "zod";
import { asc, eq, inArray } from "drizzle-orm";
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
  assignments: assignmentsSchema,
});

export const taskRoutingUpdateSchema = taskRoutingSchema.omit({ taskType: true });

export type TaskAssignmentInput = z.infer<typeof assignmentSchema>;

export async function listTaskRouting(db: Database) {
  const [configs, routes] = await Promise.all([
    db.select().from(aiConfigs),
    db
      .select({
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
      })
      .from(aiTaskCredentials)
      .innerJoin(
        aiCredentials,
        eq(aiTaskCredentials.credentialId, aiCredentials.id)
      )
      .orderBy(asc(aiTaskCredentials.taskType), asc(aiTaskCredentials.priority)),
  ]);

  return configs.map((config) => ({
    ...config,
    assignments: routes.filter((route) => route.taskType === config.taskType),
  }));
}

export async function saveTaskRouting(
  db: Database,
  taskType: AITaskType,
  enabled: boolean,
  assignments: TaskAssignmentInput[]
): Promise<void> {
  if (enabled && assignments.filter((assignment) => assignment.enabled ?? true).length === 0) {
    throw badRequest("An enabled AI task requires at least one credential");
  }

  const credentialIds = assignments.map((assignment) => assignment.credentialId);
  const credentials = credentialIds.length
    ? await db
        .select({ id: aiCredentials.id, provider: aiCredentials.provider })
        .from(aiCredentials)
        .where(inArray(aiCredentials.id, credentialIds))
    : [];
  if (credentials.length !== credentialIds.length) {
    throw badRequest("One or more AI credentials do not exist");
  }
  for (const credential of credentials) {
    if (!isProviderAllowedForTask(taskType, credential.provider)) {
      throw badRequest("Credential provider is not supported for this AI task");
    }
  }

  const now = new Date().toISOString();
  const existing = await db.query.aiConfigs.findFirst({
    where: eq(aiConfigs.taskType, taskType),
  });
  const statements: BatchItem<"sqlite">[] = [
    existing
      ? db
          .update(aiConfigs)
          .set({ enabled, updatedAt: now })
          .where(eq(aiConfigs.id, existing.id))
      : db.insert(aiConfigs).values({
          id: crypto.randomUUID(),
          taskType,
          enabled,
          createdAt: now,
          updatedAt: now,
        }),
    db
      .delete(aiTaskCredentials)
      .where(eq(aiTaskCredentials.taskType, taskType)),
  ];

  assignments.forEach((assignment, priority) => {
    statements.push(
      db.insert(aiTaskCredentials).values({
        id: crypto.randomUUID(),
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
  taskType: AITaskType
): Promise<void> {
  await db.batch([
    db
      .delete(aiTaskCredentials)
      .where(eq(aiTaskCredentials.taskType, taskType)),
    db.delete(aiConfigs).where(eq(aiConfigs.taskType, taskType)),
  ]);
}
