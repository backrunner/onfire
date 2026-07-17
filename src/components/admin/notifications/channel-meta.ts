"use client";

import {
  BellRing,
  Blocks,
  Bot,
  Building2,
  Feather,
  Mail,
  MessageCircleMore,
  MessageSquare,
  Radio,
  Send,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import {
  CHANNEL_DEFINITIONS,
  CHANNEL_TYPES,
  RECIPIENT_TYPES,
  REQUIREMENT_SCOPE_TYPES,
  TRIGGER_EVENTS,
  type ChannelFieldDefinition,
  type NotificationChannelType,
  type NotificationRecipientType,
  type NotificationRequirementScope,
  type NotificationTriggerEvent,
} from "@/lib/notifications/channel-definitions";

export {
  CHANNEL_TYPES,
  RECIPIENT_TYPES,
  REQUIREMENT_SCOPE_TYPES,
  TRIGGER_EVENTS,
};
export type ChannelType = NotificationChannelType;
export type TriggerEvent = NotificationTriggerEvent;
export type RecipientType = NotificationRecipientType;
export type RequirementScope = NotificationRequirementScope;
export type ChannelFieldMeta = ChannelFieldDefinition;

export interface EndpointView {
  id: string;
  userId: string;
  channelType: ChannelType;
  name: string;
  enabled: boolean | null;
  config: Record<string, unknown>;
  secretFields?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRuleView {
  id: string;
  productId: string;
  name: string;
  enabled: boolean | null;
  triggerEvents: TriggerEvent[];
  channelTypes: ChannelType[];
  recipientType: RecipientType;
  recipientTeamId: string | null;
  recipientUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRequirementView {
  id: string;
  productId: string;
  name: string;
  enabled: boolean | null;
  scopeType: RequirementScope;
  scopeTeamId: string | null;
  scopeUserId: string | null;
  triggerEvents: TriggerEvent[];
  channelTypes: ChannelType[];
  createdAt: string;
  updatedAt: string;
}

export interface NotificationTeamView {
  id: string;
  name: string;
}

export interface NotificationAgentView {
  userId: string;
  displayName: string;
  email: string;
  teamIds: string[];
  channelTypes: ChannelType[];
}

export interface NotificationComplianceView {
  teams: NotificationTeamView[];
  agents: NotificationAgentView[];
  requirements: Array<
    NotificationRequirementView & {
      targetCount: number;
      missing: Array<{
        userId: string;
        displayName: string;
        channelTypes: ChannelType[];
      }>;
    }
  >;
}

export const CHANNEL_ICONS: Record<ChannelType, LucideIcon> = {
  email: Mail,
  pushdeer: BellRing,
  bark: Smartphone,
  ntfy: Radio,
  telegram: Send,
  discord: MessageSquare,
  slack: MessageSquare,
  teams: Blocks,
  feishu: Feather,
  dingtalk: MessageCircleMore,
  wecom: Building2,
};

export const CHANNEL_FIELDS: Record<
  ChannelType,
  readonly ChannelFieldMeta[]
> = Object.fromEntries(
  CHANNEL_TYPES.map((type) => [type, CHANNEL_DEFINITIONS[type].fields])
) as Record<ChannelType, readonly ChannelFieldMeta[]>;

export const RECIPIENT_ICONS: Record<RecipientType, LucideIcon> = {
  assignee: Bot,
  ticket_team: MessageSquare,
  product_agents: Building2,
  team: Building2,
  user: Bot,
};
