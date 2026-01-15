/**
 * Notification Channels Admin Routes
 */
import { eq, inArray, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { assertPermission } from '@onfire/shared/rbac';
import { notificationChannels, notificationLogs } from '@onfire/shared/drizzle/schema';
import type { NotificationChannelType, NotificationTriggerEvent } from '@onfire/shared/drizzle/schema';
import { ok } from '../../../core/response';
import { NOTIFICATION_CHANNELS, TRIGGER_EVENT_LABELS } from '../../../services/notification/types';
import { sendTestNotification } from '../../../services/notification/service';

export const notificationChannelRoutes = () => {
  const router = createRouter();

  // GET /notification-channels/meta - Get available channel types and trigger events
  router.get('/notification-channels/meta', async (c) => {
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    return c.json(ok({
      channelTypes: Object.entries(NOTIFICATION_CHANNELS).map(([id, meta]) => ({
        id,
        ...meta
      })),
      triggerEvents: Object.entries(TRIGGER_EVENT_LABELS).map(([id, name]) => ({
        id,
        name
      }))
    }));
  });

  // GET /notification-channels - List notification channels
  router.get('/notification-channels', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const productId = c.req.query('productId');
    const targetIds = productId ? [productId] : ctx.productIds;

    if (!targetIds.length) {
      return c.json(ok({ data: [] }));
    }

    const channels = await db.select().from(notificationChannels)
      .where(inArray(notificationChannels.productId, targetIds));

    // Mask sensitive config fields
    const masked = channels.map(channel => {
      try {
        const config = JSON.parse(channel.config) as Record<string, unknown>;
        const maskedConfig: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(config)) {
          // Mask sensitive fields
          if (typeof value === 'string' && (
            key.toLowerCase().includes('key') ||
            key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('password')
          )) {
            maskedConfig[key] = '********';
          } else {
            maskedConfig[key] = value;
          }
        }

        return {
          ...channel,
          config: JSON.stringify(maskedConfig),
          triggerEvents: JSON.parse(channel.triggerEvents)
        };
      } catch {
        return {
          ...channel,
          triggerEvents: []
        };
      }
    });

    return c.json(ok({ data: masked }));
  });

  // GET /notification-channels/:id - Get single channel
  router.get('/notification-channels/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const id = c.req.param('id');
    const channel = await db.query.notificationChannels.findFirst({
      where: eq(notificationChannels.id, id)
    });

    if (!channel) {
      return handleResult(c, errorResult(404, 'Channel not found'));
    }

    // Check product access
    if (!ctx.productIds.includes(channel.productId)) {
      return handleResult(c, errorResult(403, 'Access denied'));
    }

    // Mask sensitive config fields
    try {
      const config = JSON.parse(channel.config) as Record<string, unknown>;
      const maskedConfig: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string' && (
          key.toLowerCase().includes('key') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('password')
        )) {
          maskedConfig[key] = '********';
        } else {
          maskedConfig[key] = value;
        }
      }

      return c.json(ok({
        data: {
          ...channel,
          config: JSON.stringify(maskedConfig),
          triggerEvents: JSON.parse(channel.triggerEvents)
        }
      }));
    } catch {
      return c.json(ok({ data: channel }));
    }
  });

  // POST /notification-channels - Create notification channel
  router.post('/notification-channels', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const body = await c.req.json<{
      productId: string;
      channelType: NotificationChannelType;
      name: string;
      enabled?: boolean;
      config: Record<string, unknown>;
      triggerEvents: NotificationTriggerEvent[];
    }>();

    if (!body.productId || !body.channelType || !body.name || !body.config || !body.triggerEvents) {
      return handleResult(c, errorResult(400, 'productId, channelType, name, config, and triggerEvents required'));
    }

    // Validate channel type
    if (!NOTIFICATION_CHANNELS[body.channelType]) {
      return handleResult(c, errorResult(400, `Invalid channel type: ${body.channelType}`));
    }

    // Validate trigger events
    const validEvents = Object.keys(TRIGGER_EVENT_LABELS);
    for (const event of body.triggerEvents) {
      if (!validEvents.includes(event)) {
        return handleResult(c, errorResult(400, `Invalid trigger event: ${event}`));
      }
    }

    // Check product access
    if (!ctx.productIds.includes(body.productId)) {
      return handleResult(c, errorResult(403, 'Access denied to this product'));
    }

    const now = new Date().toISOString();
    const id = nanoid();

    await db.insert(notificationChannels).values({
      id,
      productId: body.productId,
      channelType: body.channelType,
      name: body.name,
      enabled: body.enabled ?? true,
      config: JSON.stringify(body.config),
      triggerEvents: JSON.stringify(body.triggerEvents),
      createdAt: now,
      updatedAt: now
    });

    return c.json(ok({ ok: true, id }));
  });

  // PATCH /notification-channels/:id - Update notification channel
  router.patch('/notification-channels/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const id = c.req.param('id');
    const channel = await db.query.notificationChannels.findFirst({
      where: eq(notificationChannels.id, id)
    });

    if (!channel) {
      return handleResult(c, errorResult(404, 'Channel not found'));
    }

    // Check product access
    if (!ctx.productIds.includes(channel.productId)) {
      return handleResult(c, errorResult(403, 'Access denied'));
    }

    const body = await c.req.json<{
      name?: string;
      enabled?: boolean;
      config?: Record<string, unknown>;
      triggerEvents?: NotificationTriggerEvent[];
    }>();

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (body.name !== undefined) updates.name = body.name;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.triggerEvents !== undefined) {
      // Validate trigger events
      const validEvents = Object.keys(TRIGGER_EVENT_LABELS);
      for (const event of body.triggerEvents) {
        if (!validEvents.includes(event)) {
          return handleResult(c, errorResult(400, `Invalid trigger event: ${event}`));
        }
      }
      updates.triggerEvents = JSON.stringify(body.triggerEvents);
    }

    if (body.config !== undefined) {
      // Merge config, preserving masked values
      try {
        const existingConfig = JSON.parse(channel.config) as Record<string, unknown>;
        const newConfig: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(body.config)) {
          // Don't update if value is '********' (masked)
          if (value === '********') {
            newConfig[key] = existingConfig[key];
          } else {
            newConfig[key] = value;
          }
        }

        updates.config = JSON.stringify(newConfig);
      } catch {
        updates.config = JSON.stringify(body.config);
      }
    }

    await db.update(notificationChannels)
      .set(updates)
      .where(eq(notificationChannels.id, id));

    return c.json(ok({ ok: true }));
  });

  // DELETE /notification-channels/:id - Delete notification channel
  router.delete('/notification-channels/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const id = c.req.param('id');
    const channel = await db.query.notificationChannels.findFirst({
      where: eq(notificationChannels.id, id)
    });

    if (!channel) {
      return handleResult(c, errorResult(404, 'Channel not found'));
    }

    // Check product access
    if (!ctx.productIds.includes(channel.productId)) {
      return handleResult(c, errorResult(403, 'Access denied'));
    }

    await db.delete(notificationChannels)
      .where(eq(notificationChannels.id, id));

    return c.json(ok({ ok: true }));
  });

  // POST /notification-channels/:id/test - Test notification channel
  router.post('/notification-channels/:id/test', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const id = c.req.param('id');
    const channel = await db.query.notificationChannels.findFirst({
      where: eq(notificationChannels.id, id)
    });

    if (!channel) {
      return handleResult(c, errorResult(404, 'Channel not found'));
    }

    // Check product access
    if (!ctx.productIds.includes(channel.productId)) {
      return handleResult(c, errorResult(403, 'Access denied'));
    }

    // Use current user as test agent
    const testAgentId = ctx.user.id;

    const result = await sendTestNotification(db, id, testAgentId);

    if (!result.success) {
      return handleResult(c, errorResult(400, result.error || 'Test notification failed'));
    }

    return c.json(ok({ ok: true, messageId: result.messageId }));
  });

  // GET /notification-logs - List notification logs
  router.get('/notification-logs', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const productId = c.req.query('productId');
    const channelId = c.req.query('channelId');
    const ticketId = c.req.query('ticketId');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const targetIds = productId ? [productId] : ctx.productIds;

    if (!targetIds.length) {
      return c.json(ok({ data: [], total: 0 }));
    }

    // Build query
    let query = db.select().from(notificationLogs)
      .where(inArray(notificationLogs.productId, targetIds))
      .orderBy(desc(notificationLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const logs = await query;

    // Filter by channelId and ticketId if provided
    let filtered = logs;
    if (channelId) {
      filtered = filtered.filter(log => log.channelId === channelId);
    }
    if (ticketId) {
      filtered = filtered.filter(log => log.ticketId === ticketId);
    }

    return c.json(ok({ data: filtered, total: filtered.length }));
  });

  return router;
};
