import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { templates } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { ok } from '../../../core/response';

interface FormField {
  label?: string;
  key?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}

interface FormSchema {
  fields?: FormField[];
}

export const templateRoutes = () => {
  const router = createRouter();

  // GET /templates
  router.get('/templates', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'template.read');

    const rows =
      ctx.user.role === Role.SuperAdmin
        ? await db.select().from(templates)
        : await db.select().from(templates).where(inArray(templates.productId, ctx.productIds));
    return c.json(ok({ data: rows }));
  });

  // POST /templates
  router.post('/templates', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'template.write');

    const body = await c.req.json<{ productId: string; title: string; categories: string; formSchema: string }>();
    if (!body.productId || !body.title) {
      return handleResult(c, errorResult(400, 'productId and title required'));
    }
    if (!ctx.productIds.includes(body.productId)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }

    let parsedSchema: FormSchema | FormField[] | null = null;
    try {
      parsedSchema = JSON.parse(body.formSchema ?? '');
    } catch {
      return handleResult(c, errorResult(400, 'invalid formSchema json'));
    }

    const fields: FormField[] = Array.isArray(parsedSchema) ? parsedSchema : (parsedSchema as FormSchema).fields ?? [];
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
    await db
      .insert(templates)
      .values({
        id,
        productId: body.productId,
        title: body.title,
        categories: body.categories ?? '[]',
        formSchema: JSON.stringify(ensuredSchema)
      })
      .run();
    return c.json(ok({ ok: true, id }));
  });

  // PATCH /templates/:id
  router.patch('/templates/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'template.write');

    const id = c.req.param('id');
    const body = await c.req.json<{ title?: string; categories?: string; formSchema?: string }>();

    const existing = await db.query.templates.findFirst({ where: eq(templates.id, id) });
    if (!existing) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    if (ctx.user.role !== Role.SuperAdmin && !ctx.productIds.includes(existing.productId as string)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }

    let parsedSchema: FormSchema | FormField[] | null = null;
    if (body.formSchema) {
      try {
        parsedSchema = JSON.parse(body.formSchema);
      } catch {
        return handleResult(c, errorResult(400, 'invalid formSchema json'));
      }
    }

    const fields: FormField[] =
      parsedSchema !== null ? (Array.isArray(parsedSchema) ? parsedSchema : (parsedSchema as FormSchema).fields ?? []) : (() => {
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

    await db
      .update(templates)
      .set({
        ...(body.title ? { title: body.title } : {}),
        ...(body.categories ? { categories: body.categories } : {}),
        ...(ensuredSchema ? { formSchema: JSON.stringify(ensuredSchema) } : {})
      })
      .where(eq(templates.id, id))
      .run();
    return c.json(ok({ ok: true }));
  });

  // DELETE /templates/:id
  router.delete('/templates/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'template.write');

    const id = c.req.param('id');
    const existing = await db.query.templates.findFirst({ where: eq(templates.id, id) });
    if (!existing) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    if (ctx.user.role !== Role.SuperAdmin && !ctx.productIds.includes(existing.productId as string)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }

    await db.delete(templates).where(eq(templates.id, id)).run();
    return c.json(ok({ ok: true }));
  });

  return router;
};
