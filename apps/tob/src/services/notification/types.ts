/**
 * Notification Service Types
 */
import type { NotificationChannelType, NotificationTriggerEvent } from '@onfire/shared/drizzle/schema';

// Notification message payload
export interface NotificationPayload {
  ticketId: string;
  ticketSubject: string;
  ticketContent: string;
  ticketPriority: string;
  ticketUrl: string;
  customerEmail: string;
  customerName?: string;
  productName: string;
  triggerEvent: NotificationTriggerEvent;
  previousAgentName?: string; // For reassignment/escalation
}

// Agent info for notification
export interface AgentInfo {
  userId: string;
  email: string;
  displayName: string;
}

// Result of sending a notification
export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Notification provider interface
export interface INotificationProvider {
  type: NotificationChannelType;
  send(agent: AgentInfo, payload: NotificationPayload): Promise<NotificationResult>;
  validateConfig(): Promise<boolean>;
}

// Channel configuration types
export interface EmailChannelConfig {
  useProductEmailConfig: true;
}

export interface PushDeerChannelConfig {
  pushKey: string;
}

export interface BarkChannelConfig {
  serverUrl: string; // e.g., https://api.day.app
  deviceKey: string;
}

export interface NtfyChannelConfig {
  serverUrl: string; // e.g., https://ntfy.sh
  topic: string;
  authToken?: string;
}

export interface TelegramChannelConfig {
  botToken: string;
  chatId: string; // Can be group chat ID
}

export interface DiscordChannelConfig {
  webhookUrl: string;
}

export type ChannelConfig =
  | EmailChannelConfig
  | PushDeerChannelConfig
  | BarkChannelConfig
  | NtfyChannelConfig
  | TelegramChannelConfig
  | DiscordChannelConfig;

// Channel metadata for UI
export interface ChannelConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  placeholder?: string;
}

export interface ChannelMetadata {
  name: string;
  description: string;
  configFields: ChannelConfigField[];
}

export const NOTIFICATION_CHANNELS: Record<NotificationChannelType, ChannelMetadata> = {
  email: {
    name: 'Email',
    description: 'Send notifications via email (uses product email configuration)',
    configFields: [] // Uses existing email config
  },
  pushdeer: {
    name: 'PushDeer',
    description: 'Push notifications via PushDeer',
    configFields: [
      { key: 'pushKey', label: 'Push Key', type: 'password', required: true, placeholder: 'PDU...' }
    ]
  },
  bark: {
    name: 'Bark',
    description: 'Push notifications via Bark (iOS)',
    configFields: [
      { key: 'serverUrl', label: 'Server URL', type: 'url', required: true, placeholder: 'https://api.day.app' },
      { key: 'deviceKey', label: 'Device Key', type: 'password', required: true }
    ]
  },
  ntfy: {
    name: 'ntfy',
    description: 'Push notifications via ntfy.sh',
    configFields: [
      { key: 'serverUrl', label: 'Server URL', type: 'url', required: true, placeholder: 'https://ntfy.sh' },
      { key: 'topic', label: 'Topic', type: 'text', required: true },
      { key: 'authToken', label: 'Auth Token (optional)', type: 'password', required: false }
    ]
  },
  telegram: {
    name: 'Telegram',
    description: 'Send notifications via Telegram Bot',
    configFields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', required: true },
      { key: 'chatId', label: 'Chat ID', type: 'text', required: true, placeholder: '-1001234567890' }
    ]
  },
  discord: {
    name: 'Discord',
    description: 'Send notifications via Discord Webhook',
    configFields: [
      { key: 'webhookUrl', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://discord.com/api/webhooks/...' }
    ]
  }
};

// Trigger event labels
export const TRIGGER_EVENT_LABELS: Record<NotificationTriggerEvent, string> = {
  ticket_assigned: 'Ticket Assigned',
  ticket_reassigned: 'Ticket Reassigned',
  ticket_escalated: 'Ticket Escalated'
};
