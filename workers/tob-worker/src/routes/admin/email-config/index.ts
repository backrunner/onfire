/**
 * Email Configuration Admin Routes
 */
import { eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { assertPermission } from '@onfire/shared/rbac';
import { emailConfigs, emailTemplates, products } from '@onfire/shared/drizzle/schema';
import { ok } from '../../../core/response';
import { sendTestEmail, EMAIL_PROVIDERS, DEFAULT_TEMPLATES } from '../../../services/email';
import type { EmailProvider, EmailTemplateType } from '@onfire/shared/drizzle/schema';

export const emailConfigRoutes = () => {
  const router = createRouter();

  // GET /email-config/meta - Get available providers and template types
  router.get('/email-config/meta', async (c) => {
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    return c.json(ok({
      providers: Object.entries(EMAIL_PROVIDERS).map(([key, value]) => ({
        id: key,
        ...value
      })),
      templateTypes: Object.keys(DEFAULT_TEMPLATES),
      defaultTemplates: DEFAULT_TEMPLATES
    }));
  });

  // GET /email-config - List all email configs
  router.get('/email-config', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const productId = c.req.query('productId');
    const targetIds = productId ? [productId] : ctx.productIds;

    if (!targetIds.length) {
      return c.json(ok({ data: [] }));
    }

    const configs = await db.select().from(emailConfigs)
      .where(inArray(emailConfigs.productId, targetIds));

    // Mask sensitive fields
    const masked = configs.map(config => ({
      ...config,
      outboundApiKey: config.outboundApiKey ? '********' : null,
      outboundSmtpPass: config.outboundSmtpPass ? '********' : null,
      inboundWebhookSecret: config.inboundWebhookSecret ? '********' : null
    }));

    return c.json(ok({ data: masked }));
  });

  // GET /email-config/:productId - Get email config for product
  router.get('/email-config/:productId', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const productId = c.req.param('productId');

    // Check product access
    if (!ctx.productIds.includes(productId)) {
      return handleResult(c, errorResult(403, 'Access denied to this product'));
    }

    const config = await db.query.emailConfigs.findFirst({
      where: eq(emailConfigs.productId, productId)
    });

    if (!config) {
      return c.json(ok({ data: null }));
    }

    // Mask sensitive fields
    return c.json(ok({
      data: {
        ...config,
        outboundApiKey: config.outboundApiKey ? '********' : null,
        outboundSmtpPass: config.outboundSmtpPass ? '********' : null,
        inboundWebhookSecret: config.inboundWebhookSecret ? '********' : null
      }
    }));
  });

  // POST /email-config - Create email config
  router.post('/email-config', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const body = await c.req.json<{
      productId: string;
      inboundEnabled?: boolean;
      inboundProvider?: string;
      inboundAddress?: string;
      outboundEnabled?: boolean;
      outboundProvider?: EmailProvider;
      outboundApiKey?: string;
      outboundSmtpHost?: string;
      outboundSmtpPort?: number;
      outboundSmtpUser?: string;
      outboundSmtpPass?: string;
      outboundSenderName?: string;
      outboundSenderEmail?: string;
      outboundReplyTo?: string;
      aiFilterEnabled?: boolean;
      aiFilterStrictness?: string;
    }>();

    if (!body.productId) {
      return handleResult(c, errorResult(400, 'productId required'));
    }

    // Check product access
    if (!ctx.productIds.includes(body.productId)) {
      return handleResult(c, errorResult(403, 'Access denied to this product'));
    }

    // Check if config already exists
    const existing = await db.query.emailConfigs.findFirst({
      where: eq(emailConfigs.productId, body.productId)
    });
    if (existing) {
      return handleResult(c, errorResult(400, 'Email config already exists for this product'));
    }

    const now = new Date().toISOString();
    const id = nanoid();

    await db.insert(emailConfigs).values({
      id,
      productId: body.productId,
      inboundEnabled: body.inboundEnabled ?? false,
      inboundProvider: body.inboundProvider as any,
      inboundAddress: body.inboundAddress,
      outboundEnabled: body.outboundEnabled ?? false,
      outboundProvider: body.outboundProvider,
      outboundApiKey: body.outboundApiKey,
      outboundSmtpHost: body.outboundSmtpHost,
      outboundSmtpPort: body.outboundSmtpPort,
      outboundSmtpUser: body.outboundSmtpUser,
      outboundSmtpPass: body.outboundSmtpPass,
      outboundSenderName: body.outboundSenderName,
      outboundSenderEmail: body.outboundSenderEmail,
      outboundReplyTo: body.outboundReplyTo,
      aiFilterEnabled: body.aiFilterEnabled ?? true,
      aiFilterStrictness: body.aiFilterStrictness as any ?? 'medium',
      createdAt: now,
      updatedAt: now
    });

    return c.json(ok({ ok: true, id }));
  });

  // PATCH /email-config/:productId - Update email config
  router.patch('/email-config/:productId', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const productId = c.req.param('productId');

    // Check product access
    if (!ctx.productIds.includes(productId)) {
      return handleResult(c, errorResult(403, 'Access denied to this product'));
    }

    const existing = await db.query.emailConfigs.findFirst({
      where: eq(emailConfigs.productId, productId)
    });
    if (!existing) {
      return handleResult(c, errorResult(404, 'Email config not found'));
    }

    const body = await c.req.json<Record<string, any>>();
    const now = new Date().toISOString();

    // Build update object, excluding productId and id
    const updates: Record<string, any> = { updatedAt: now };
    const allowedFields = [
      'inboundEnabled', 'inboundProvider', 'inboundAddress', 'inboundWebhookSecret',
      'outboundEnabled', 'outboundProvider', 'outboundApiKey',
      'outboundSmtpHost', 'outboundSmtpPort', 'outboundSmtpUser', 'outboundSmtpPass',
      'outboundSenderName', 'outboundSenderEmail', 'outboundReplyTo',
      'aiFilterEnabled', 'aiFilterStrictness'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        // Don't update if value is '********' (masked)
        if (body[field] === '********') continue;
        updates[field] = body[field];
      }
    }

    await db.update(emailConfigs)
      .set(updates)
      .where(eq(emailConfigs.productId, productId));

    return c.json(ok({ ok: true }));
  });

  // DELETE /email-config/:productId - Delete email config
  router.delete('/email-config/:productId', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const productId = c.req.param('productId');

    // Check product access
    if (!ctx.productIds.includes(productId)) {
      return handleResult(c, errorResult(403, 'Access denied to this product'));
    }

    await db.delete(emailConfigs)
      .where(eq(emailConfigs.productId, productId));

    // Also delete templates
    await db.delete(emailTemplates)
      .where(eq(emailTemplates.productId, productId));

    return c.json(ok({ ok: true }));
  });

  // POST /email-config/:productId/test - Test outbound email
  router.post('/email-config/:productId/test', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const productId = c.req.param('productId');
    const body = await c.req.json<{ email: string }>();

    if (!body.email) {
      return handleResult(c, errorResult(400, 'email required'));
    }

    // Check product access
    if (!ctx.productIds.includes(productId)) {
      return handleResult(c, errorResult(403, 'Access denied to this product'));
    }

    const result = await sendTestEmail(db, productId, body.email);

    if (!result.success) {
      return handleResult(c, errorResult(400, result.error || 'Test email failed'));
    }

    return c.json(ok({ ok: true, messageId: result.messageId }));
  });

  // POST /email-config/:productId/webhook-secret - Generate/rotate webhook secret
  router.post('/email-config/:productId/webhook-secret', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const productId = c.req.param('productId');

    // Check product access
    if (!ctx.productIds.includes(productId)) {
      return handleResult(c, errorResult(403, 'Access denied to this product'));
    }

    // Check if config exists
    const existing = await db.query.emailConfigs.findFirst({
      where: eq(emailConfigs.productId, productId)
    });

    if (!existing) {
      return handleResult(c, errorResult(404, 'Email config not found. Create email config first.'));
    }

    // Generate a secure webhook secret (32 bytes = 64 hex chars)
    const secretBytes = new Uint8Array(32);
    crypto.getRandomValues(secretBytes);
    const webhookSecret = Array.from(secretBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const now = new Date().toISOString();

    await db.update(emailConfigs)
      .set({
        inboundWebhookSecret: webhookSecret,
        updatedAt: now
      })
      .where(eq(emailConfigs.productId, productId));

    return c.json(ok({
      ok: true,
      webhookSecret,
      message: 'Webhook secret generated. Store this securely - it will not be shown again.'
    }));
  });

  // ==================== Email Templates ====================

  // GET /email-templates - List templates
  router.get('/email-templates', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const productId = c.req.query('productId');
    const targetIds = productId ? [productId] : ctx.productIds;

    if (!targetIds.length) {
      return c.json(ok({ data: [] }));
    }

    const templates = await db.select().from(emailTemplates)
      .where(inArray(emailTemplates.productId, targetIds));

    return c.json(ok({ data: templates }));
  });

  // GET /email-templates/:id - Get template
  router.get('/email-templates/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const id = c.req.param('id');
    const template = await db.query.emailTemplates.findFirst({
      where: eq(emailTemplates.id, id)
    });

    if (!template) {
      return handleResult(c, errorResult(404, 'Template not found'));
    }

    // Check product access
    if (!ctx.productIds.includes(template.productId)) {
      return handleResult(c, errorResult(403, 'Access denied'));
    }

    return c.json(ok({ data: template }));
  });

  // POST /email-templates - Create template
  router.post('/email-templates', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const body = await c.req.json<{
      productId: string;
      templateType: EmailTemplateType;
      subjectTemplate: string;
      bodyTemplate: string;
      enabled?: boolean;
    }>();

    if (!body.productId || !body.templateType || !body.subjectTemplate || !body.bodyTemplate) {
      return handleResult(c, errorResult(400, 'productId, templateType, subjectTemplate, and bodyTemplate required'));
    }

    // Check product access
    if (!ctx.productIds.includes(body.productId)) {
      return handleResult(c, errorResult(403, 'Access denied to this product'));
    }

    const now = new Date().toISOString();
    const id = nanoid();

    await db.insert(emailTemplates).values({
      id,
      productId: body.productId,
      templateType: body.templateType,
      subjectTemplate: body.subjectTemplate,
      bodyTemplate: body.bodyTemplate,
      enabled: body.enabled ?? true,
      createdAt: now,
      updatedAt: now
    });

    return c.json(ok({ ok: true, id }));
  });

  // PATCH /email-templates/:id - Update template
  router.patch('/email-templates/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const id = c.req.param('id');
    const template = await db.query.emailTemplates.findFirst({
      where: eq(emailTemplates.id, id)
    });

    if (!template) {
      return handleResult(c, errorResult(404, 'Template not found'));
    }

    // Check product access
    if (!ctx.productIds.includes(template.productId)) {
      return handleResult(c, errorResult(403, 'Access denied'));
    }

    const body = await c.req.json<{
      subjectTemplate?: string;
      bodyTemplate?: string;
      enabled?: boolean;
    }>();

    const now = new Date().toISOString();
    const updates: Record<string, any> = { updatedAt: now };

    if (body.subjectTemplate !== undefined) updates.subjectTemplate = body.subjectTemplate;
    if (body.bodyTemplate !== undefined) updates.bodyTemplate = body.bodyTemplate;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    await db.update(emailTemplates)
      .set(updates)
      .where(eq(emailTemplates.id, id));

    return c.json(ok({ ok: true }));
  });

  // DELETE /email-templates/:id - Delete template
  router.delete('/email-templates/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const id = c.req.param('id');
    const template = await db.query.emailTemplates.findFirst({
      where: eq(emailTemplates.id, id)
    });

    if (!template) {
      return handleResult(c, errorResult(404, 'Template not found'));
    }

    // Check product access
    if (!ctx.productIds.includes(template.productId)) {
      return handleResult(c, errorResult(403, 'Access denied'));
    }

    await db.delete(emailTemplates)
      .where(eq(emailTemplates.id, id));

    return c.json(ok({ ok: true }));
  });

  return router;
};
