import { and, asc, eq, isNull, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "@/lib/db";
import { products, ticketTypePresets, ticketTypes, type TicketTypePresetRow } from "@/drizzle/schema";
import { parseI18nRecord, parseSupportedLanguages } from "@/lib/product-language";

export const MAX_TICKET_TYPE_PRESET_DEPTH = 3;

export class TicketTypePresetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketTypePresetValidationError";
  }
}

export class TicketTypePresetConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketTypePresetConflictError";
  }
}

/**
 * Preset base columns are English. Rebase them into a product's default
 * language while retaining the other enabled languages as i18n companions.
 */
export function projectPresetTextForProduct(
  base: string,
  raw: string | null,
  defaultLanguage: string,
  languages: string[]
): { base: string; i18n: string | null };
export function projectPresetTextForProduct(
  base: null,
  raw: string | null,
  defaultLanguage: string,
  languages: string[]
): { base: null; i18n: null };
export function projectPresetTextForProduct(
  base: string | null,
  raw: string | null,
  defaultLanguage: string,
  languages: string[]
): { base: string | null; i18n: string | null };
export function projectPresetTextForProduct(
  base: string | null,
  raw: string | null,
  defaultLanguage: string,
  languages: string[]
) {
  if (base === null) return { base: null, i18n: null };
  const all: Record<string, string> = {
    en: base,
    ...(parseI18nRecord(raw) ?? {}),
  };
  const projectedBase = all[defaultLanguage] ?? base;
  const translations = Object.fromEntries(
    languages
      .filter((language) => language !== defaultLanguage)
      .map((language) => [language, all[language]])
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
  return {
    base: projectedBase,
    i18n: Object.keys(translations).length > 0
      ? JSON.stringify(translations)
      : null,
  };
}

export async function loadPreset(db: Database, id: string): Promise<TicketTypePresetRow | null> {
  return (await db.query.ticketTypePresets.findFirst({ where: eq(ticketTypePresets.id, id) })) ?? null;
}

export async function loadPresetPath(db: Database, preset: TicketTypePresetRow) {
  const path = [preset];
  const seen = new Set([preset.id]);
  let current = preset;
  while (current.parentId) {
    if (seen.has(current.parentId)) throw new TicketTypePresetValidationError("Ticket type preset hierarchy contains a cycle");
    const parent = await loadPreset(db, current.parentId);
    if (!parent || parent.tenantId !== preset.tenantId) {
      throw new TicketTypePresetValidationError("Ticket type preset hierarchy crosses tenant scope");
    }
    path.unshift(parent);
    seen.add(parent.id);
    current = parent;
    if (path.length > MAX_TICKET_TYPE_PRESET_DEPTH) {
      throw new TicketTypePresetValidationError("Ticket type preset hierarchy exceeds three levels");
    }
  }
  return path;
}

export async function listTenantPresets(db: Database, tenantIds?: string[]) {
  if (tenantIds?.length === 0) return [];
  const rows = tenantIds
    ? await db
        .select()
        .from(ticketTypePresets)
        .where(inArray(ticketTypePresets.tenantId, tenantIds))
    : await db.select().from(ticketTypePresets);
  return rows.sort((a, b) => a.level - b.level || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function assertPresetNameAvailable(
  db: Database,
  input: { tenantId: string; parentId: string | null; name: string; excludeId?: string }
) {
  const row = await db
    .select({ id: ticketTypePresets.id })
    .from(ticketTypePresets)
    .where(
      and(
        eq(ticketTypePresets.tenantId, input.tenantId),
        input.parentId ? eq(ticketTypePresets.parentId, input.parentId) : isNull(ticketTypePresets.parentId),
        sql`lower(${ticketTypePresets.name}) = ${input.name.toLowerCase()}`
      )
    )
    .get();
  if (row && row.id !== input.excludeId) throw new TicketTypePresetConflictError("A preset with this name already exists at this level");
}

export async function presetParentLevel(db: Database, tenantId: string, parentId: string | null) {
  if (!parentId) return 1;
  const parent = await loadPreset(db, parentId);
  if (!parent || parent.tenantId !== tenantId) throw new TicketTypePresetValidationError("Parent preset belongs to another tenant");
  if (parent.archivedAt) throw new TicketTypePresetValidationError("Parent preset is archived");
  if (parent.level >= MAX_TICKET_TYPE_PRESET_DEPTH) throw new TicketTypePresetValidationError("Preset hierarchy cannot exceed three levels");
  return parent.level + 1;
}

export async function movePreset(db: Database, preset: TicketTypePresetRow, parentId: string | null) {
  if (parentId === preset.id) throw new TicketTypePresetValidationError("Preset cannot be moved below itself");
  const rows = await db.select().from(ticketTypePresets).where(eq(ticketTypePresets.tenantId, preset.tenantId));
  const childrenByParent = new Map<string | null, TicketTypePresetRow[]>();
  for (const row of rows) childrenByParent.set(row.parentId, [...(childrenByParent.get(row.parentId) ?? []), row]);
  const descendants: TicketTypePresetRow[] = [];
  const seen = new Set([preset.id]);
  const visit = (id: string) => {
    for (const child of childrenByParent.get(id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      descendants.push(child);
      visit(child.id);
    }
  };
  visit(preset.id);
  if (descendants.some((row) => row.id === parentId)) throw new TicketTypePresetValidationError("Preset cannot be moved below its descendant");
  const nextLevel = await presetParentLevel(db, preset.tenantId, parentId);
  const deepestOffset = descendants.reduce((max, row) => Math.max(max, row.level - preset.level), 0);
  if (nextLevel + deepestOffset > MAX_TICKET_TYPE_PRESET_DEPTH) throw new TicketTypePresetValidationError("Moving this preset would exceed three levels");
  const delta = nextLevel - preset.level;
  const now = new Date().toISOString();
  const statements: BatchItem<"sqlite">[] = [
    db.update(ticketTypePresets).set({ parentId, level: nextLevel, updatedAt: now }).where(eq(ticketTypePresets.id, preset.id)),
  ];
  for (const descendant of descendants) {
    statements.push(
      db.update(ticketTypePresets).set({ level: descendant.level + delta, updatedAt: now }).where(eq(ticketTypePresets.id, descendant.id))
    );
  }
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

export async function copyPresetToProduct(
  db: Database,
  presetId: string,
  productId: string,
  targetParentId: string | null
) {
  const preset = await loadPreset(db, presetId);
  if (!preset || preset.archivedAt) throw new TicketTypePresetValidationError("Preset not found or archived");
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });
  if (!product) throw new TicketTypePresetValidationError("Product not found");
  await loadPresetPath(db, preset);
  const productParent = targetParentId
    ? await db.query.ticketTypes.findFirst({ where: eq(ticketTypes.id, targetParentId) })
    : null;
  if (targetParentId && (!productParent || productParent.productId !== productId || productParent.archivedAt)) {
    throw new TicketTypePresetValidationError("Target parent type is invalid");
  }
  const roots = [preset];
  const sourceRows = await db
    .select()
    .from(ticketTypePresets)
    .where(eq(ticketTypePresets.tenantId, preset.tenantId))
    .orderBy(asc(ticketTypePresets.level), asc(ticketTypePresets.sortOrder));
  const sourceIds = new Set<string>();
  const collect = (id: string) => {
    if (sourceIds.has(id)) return;
    sourceIds.add(id);
    for (const child of sourceRows.filter((row) => row.parentId === id && !row.archivedAt)) collect(child.id);
  };
  for (const root of roots) collect(root.id);
  const selected = sourceRows.filter((row) => sourceIds.has(row.id));
  const targetRootLevel = productParent ? productParent.level + 1 : 1;
  const deepestOffset = selected.reduce(
    (max, row) => Math.max(max, row.level - roots[0].level),
    0
  );
  if (targetRootLevel + deepestOffset > 3) {
    throw new TicketTypePresetValidationError("Copied preset would exceed three product type levels");
  }
  const idMap = new Map<string, string>();
  const now = new Date().toISOString();
  const created: typeof ticketTypes.$inferSelect[] = [];
  const statements: BatchItem<"sqlite">[] = [];
  const supported = parseSupportedLanguages(product.supportedLanguages);
  const languages = supported.length > 0 ? supported : [product.defaultLanguage];
  for (const row of selected) {
    const parentId = row.parentId && idMap.get(row.parentId) ? idMap.get(row.parentId)! : targetParentId;
    const level = targetRootLevel + (row.level - roots[0].level);
    const id = crypto.randomUUID();
    const name = projectPresetTextForProduct(
      row.name,
      row.nameI18n,
      product.defaultLanguage,
      languages
    );
    const description = projectPresetTextForProduct(
      row.description,
      row.descriptionI18n,
      product.defaultLanguage,
      languages
    );
    idMap.set(row.id, id);
    const value = {
      id,
      productId,
      parentId,
      level,
      name: name.base,
      description: description.base,
      nameI18n: name.i18n,
      descriptionI18n: description.i18n,
      sortOrder: row.sortOrder,
      systemKey: null,
      archivedAt: null,
      archivedBy: null,
      createdAt: now,
      updatedAt: now,
    } as const;
    statements.push(db.insert(ticketTypes).values(value));
    created.push(value);
  }
  if (statements.length > 0) {
    await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  }
  return created;
}
