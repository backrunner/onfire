/**
 * Notification Provider Factory
 */
import type { NotificationChannelType } from '@onfire/shared/drizzle/schema';
import type { Db } from '@onfire/shared/drizzle/client';
import type { INotificationProvider } from '../types';
import { EmailNotificationProvider } from './email';
import { PushDeerProvider } from './pushdeer';
import { BarkProvider } from './bark';
import { NtfyProvider } from './ntfy';
import { TelegramProvider } from './telegram';
import { DiscordProvider } from './discord';

export function createNotificationProvider(
  channelType: NotificationChannelType,
  config: Record<string, unknown>,
  db?: Db,
  productId?: string
): INotificationProvider {
  switch (channelType) {
    case 'email':
      if (!db || !productId) {
        throw new Error('Email provider requires db and productId');
      }
      return new EmailNotificationProvider(config, db, productId);
    case 'pushdeer':
      return new PushDeerProvider(config);
    case 'bark':
      return new BarkProvider(config);
    case 'ntfy':
      return new NtfyProvider(config);
    case 'telegram':
      return new TelegramProvider(config);
    case 'discord':
      return new DiscordProvider(config);
    default:
      throw new Error(`Unknown notification channel type: ${channelType}`);
  }
}

export { EmailNotificationProvider } from './email';
export { PushDeerProvider } from './pushdeer';
export { BarkProvider } from './bark';
export { NtfyProvider } from './ntfy';
export { TelegramProvider } from './telegram';
export { DiscordProvider } from './discord';
