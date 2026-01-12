import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { templates } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { resolveContext } from '../../../core/context';
import type { Bindings } from '../../../core/types';

export const listTemplates = async (env: Bindings, store: any, user: any) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'template.read');
  const rows =
    ctx.user.role === Role.SuperAdmin
      ? await store.db.select().from(templates)
      : await store.db.select().from(templates).where(inArray(templates.productId, ctx.productIds));
  return { data: rows };
};

export const createTemplate = async (env: Bindings, store: any, user: any, body: { productId: string; title: string; categories: string; formSchema: string }) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'template.write');
  if (!body.productId || !body.title) return new Response('productId and title required', { status: 400 });
  if (!ctx.productIds.includes(body.productId)) return new Response('forbidden', { status: 403 });
  let parsedSchema: any = null;
  try {
    parsedSchema = JSON.parse(body.formSchema ?? '{}');
  } catch {
    return new Response('invalid formSchema json', { status: 400 });
  }
  const fields: any[] = Array.isArray(parsedSchema) ? parsedSchema : parsedSchema.fields;
  const hasTextarea = Array.isArray(fields) && fields.some((f) => f.type === 'textarea' || f.type === 'longtext');
  const ensuredSchema = hasTextarea
    ? parsedSchema
    : {
        ...(Array.isArray(parsedSchema) ? { fields: parsedSchema } : parsedSchema),
        fields: [
          {
            label: '问题详情',
            key: 'content',
            type: 'textarea',
            required: true,
            placeholder: '请详细描述问题、步骤、期望'
          },
          ...(Array.isArray(fields) ? fields : [])
        ]
      };
  const id = crypto.randomUUID();
  await store.db
    .insert(templates)
    .values({
      id,
      productId: body.productId,
      title: body.title,
      categories: body.categories ?? '[]',
      formSchema: JSON.stringify(ensuredSchema)
    })
    .run();
  return { ok: true, id };
};

export const updateTemplate = async (env: Bindings, store: any, user: any, id: string, body: { title?: string; categories?: string; formSchema?: string }) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'template.write');
  const existing = await store.db.query.templates.findFirst({ where: eq(templates.id, id) });
  if (!existing) return new Response('not found', { status: 404 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.productIds.includes(existing.productId as any)) return new Response('forbidden', { status: 403 });
  let parsedSchema: any = null;
  if (body.formSchema) {
    try {
      parsedSchema = JSON.parse(body.formSchema);
    } catch {
      return new Response('invalid formSchema json', { status: 400 });
    }
  }
  const fields: any[] =
    parsedSchema !== null ? (Array.isArray(parsedSchema) ? parsedSchema : parsedSchema.fields) : (() => {
        try { return JSON.parse(existing.formSchema).fields; } catch { return []; }
      })();
  const hasTextarea = Array.isArray(fields) && fields.some((f) => f.type === 'textarea' || f.type === 'longtext');
  const ensuredSchema =
    parsedSchema !== null
      ? hasTextarea
        ? parsedSchema
        : {
            ...(Array.isArray(parsedSchema) ? { fields: parsedSchema } : parsedSchema),
            fields: [
              {
                label: '问题详情',
                key: 'content',
                type: 'textarea',
                required: true,
                placeholder: '请详细描述问题、步骤、期望'
              },
              ...(Array.isArray(fields) ? fields : [])
            ]
          }
      : undefined;
  await store.db
    .update(templates)
    .set({
      ...(body.title ? { title: body.title } : {}),
      ...(body.categories ? { categories: body.categories } : {}),
      ...(ensuredSchema ? { formSchema: JSON.stringify(ensuredSchema) } : {})
    })
    .where(eq(templates.id, id))
    .run();
  return { ok: true };
};

export const deleteTemplate = async (env: Bindings, store: any, user: any, id: string) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'template.write');
  const existing = await store.db.query.templates.findFirst({ where: eq(templates.id, id) });
  if (!existing) return new Response('not found', { status: 404 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.productIds.includes(existing.productId as any)) return new Response('forbidden', { status: 403 });
  await store.db.delete(templates).where(eq(templates.id, id)).run();
  return { ok: true };
};
