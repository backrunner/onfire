import { and, desc, eq, isNull, max } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "@/lib/db";
import {
  ticketTemplateVersions,
  ticketTemplates,
  type TicketTemplateRow,
} from "@/drizzle/schema";
import { parseFormSchema, type FormSchema } from "@/lib/form-schema";

export async function createTemplateVersion(
  db: Database,
  input: {
    ticketTypeId: string;
    formSchema: FormSchema;
    changeNote?: string | null;
    actorId?: string | null;
  }
) {
  const existing = await db.query.ticketTemplates.findFirst({
    where: eq(ticketTemplates.ticketTypeId, input.ticketTypeId),
  });
  if (existing?.archivedAt) throw new Error("Ticket template is archived");

  const templateId = existing?.id ?? crypto.randomUUID();
  const [{ latest }] = await db
    .select({ latest: max(ticketTemplateVersions.version) })
    .from(ticketTemplateVersions)
    .where(eq(ticketTemplateVersions.templateId, templateId));
  const versionNumber = (latest ?? 0) + 1;
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: BatchItem<"sqlite">[] = [];

  if (!existing) {
    statements.push(
      db.insert(ticketTemplates).values({
        id: templateId,
        ticketTypeId: input.ticketTypeId,
        currentVersionId: versionId,
        createdAt: now,
        updatedAt: now,
      })
    );
  }
  statements.push(
    db.insert(ticketTemplateVersions).values({
      id: versionId,
      templateId,
      version: versionNumber,
      formSchema: JSON.stringify(input.formSchema),
      changeNote: input.changeNote?.trim() || null,
      createdBy: input.actorId ?? null,
      createdAt: now,
    })
  );
  if (existing) {
    statements.push(
      db
        .update(ticketTemplates)
        .set({ currentVersionId: versionId, updatedAt: now })
        .where(eq(ticketTemplates.id, existing.id))
    );
  }
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return { templateId, versionId, version: versionNumber };
}

export async function cloneTemplateVersion(
  db: Database,
  sourceVersionId: string,
  input: { ticketTypeId: string; changeNote?: string | null; actorId?: string | null }
) {
  const source = await db.query.ticketTemplateVersions.findFirst({
    where: eq(ticketTemplateVersions.id, sourceVersionId),
  });
  if (!source) throw new Error("Template version not found");
  if (source.invalidatedAt) {
    throw new Error("Invalidated template versions cannot be copied");
  }
  const template = await db.query.ticketTemplates.findFirst({
    where: and(
      eq(ticketTemplates.id, source.templateId),
      eq(ticketTemplates.ticketTypeId, input.ticketTypeId)
    ),
  });
  if (!template) throw new Error("Template version does not belong to this type");
  const formSchema = parseFormSchema(source.formSchema);
  if (!formSchema) throw new Error("Template version form configuration is invalid");
  return createTemplateVersion(db, {
    ...input,
    formSchema,
  });
}

export async function listTemplateVersions(db: Database, templateId: string) {
  return db
    .select()
    .from(ticketTemplateVersions)
    .where(eq(ticketTemplateVersions.templateId, templateId))
    .orderBy(desc(ticketTemplateVersions.version));
}

export async function restoreArchivedTemplate(
  db: Database,
  template: TicketTemplateRow,
  actorId: string
) {
  const now = new Date().toISOString();
  const current = template.currentVersionId
    ? await db.query.ticketTemplateVersions.findFirst({
        where: eq(ticketTemplateVersions.id, template.currentVersionId),
      })
    : undefined;
  if (current && !current.invalidatedAt) {
    await db
      .update(ticketTemplates)
      .set({ archivedAt: null, archivedBy: null, updatedAt: now })
      .where(eq(ticketTemplates.id, template.id));
    return { copied: false, versionId: current.id, version: current.version };
  }

  const [source] = await db
    .select()
    .from(ticketTemplateVersions)
    .where(
      and(
        eq(ticketTemplateVersions.templateId, template.id),
        isNull(ticketTemplateVersions.invalidatedAt)
      )
    )
    .orderBy(desc(ticketTemplateVersions.version))
    .limit(1);
  if (!source) throw new Error("Archived template has no valid version to restore");
  const formSchema = parseFormSchema(source.formSchema);
  if (!formSchema) throw new Error("Template version form configuration is invalid");

  const [{ latest }] = await db
    .select({ latest: max(ticketTemplateVersions.version) })
    .from(ticketTemplateVersions)
    .where(eq(ticketTemplateVersions.templateId, template.id));
  const version = (latest ?? 0) + 1;
  const versionId = crypto.randomUUID();
  await db.batch([
    db.insert(ticketTemplateVersions).values({
      id: versionId,
      templateId: template.id,
      version,
      formSchema: JSON.stringify(formSchema),
      changeNote: `Restored from v${source.version}`,
      createdBy: actorId,
      createdAt: now,
    }),
    db
      .update(ticketTemplates)
      .set({
        currentVersionId: versionId,
        archivedAt: null,
        archivedBy: null,
        updatedAt: now,
      })
      .where(eq(ticketTemplates.id, template.id)),
  ]);
  return { copied: true, versionId, version };
}
