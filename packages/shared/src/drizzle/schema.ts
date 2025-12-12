import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { Role, TicketPriority, TicketStatus } from '../index';

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  defaultTeamId: text('default_team_id')
});

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  slaHighAccept: integer('sla_high_accept'),
  slaHighReply: integer('sla_high_reply'),
  slaMediumAccept: integer('sla_medium_accept'),
  slaMediumReply: integer('sla_medium_reply'),
  slaLowAccept: integer('sla_low_accept'),
  slaLowReply: integer('sla_low_reply')
});

export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  productId: text('product_id').notNull(),
  email: text('email').notNull(),
  externalId: text('external_id'),
  level: integer('level'),
  meta: text('meta'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const productKeys = sqliteTable('product_keys', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  name: text('name'),
  secret: text('secret').notNull(),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
  revoked: integer('revoked', { mode: 'boolean' }).default(false)
});

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  allowReassign: integer('allow_reassign', { mode: 'boolean' }).default(true)
});

export const productTeams = sqliteTable('product_teams', {
  productId: text('product_id').notNull(),
  teamId: text('team_id').notNull()
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  tenantId: text('tenant_id').notNull(),
  role: text('role').$type<Role>().notNull()
});

export const agents = sqliteTable('agents', {
  userId: text('user_id').primaryKey(),
  level: integer('level').notNull().default(1),
  active: integer('active', { mode: 'boolean' }).notNull().default(true)
});

export const agentTeams = sqliteTable('agent_teams', {
  userId: text('user_id').notNull(),
  teamId: text('team_id').notNull()
});

export const agentProfiles = sqliteTable('agent_profiles', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name').notNull(),
  email: text('email').notNull(),
  avatarUrl: text('avatar_url')
});

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  title: text('title').notNull(),
  categories: text('categories').notNull(),
  formSchema: text('form_schema').notNull()
});

export const categoryRoutes = sqliteTable('category_routes', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  category: text('category').notNull(),
  subcategory: text('subcategory'),
  teamId: text('team_id').notNull()
});

export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  productId: text('product_id').notNull(),
  teamId: text('team_id').notNull(),
  assigneeId: text('assignee_id'),
  status: text('status').$type<TicketStatus>().notNull(),
  priority: text('priority').$type<TicketPriority>().notNull(),
  subject: text('subject').notNull(),
  content: text('content').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerLevel: integer('customer_level'),
  templateId: text('template_id'),
  metadata: text('metadata'),
  slaAcceptDeadline: text('sla_accept_deadline'),
  slaReplyDeadline: text('sla_reply_deadline'),
  slaAcceptBreached: integer('sla_accept_breached', { mode: 'boolean' }).default(false),
  slaReplyBreached: integer('sla_reply_breached', { mode: 'boolean' }).default(false),
  // AI-related fields
  aiScreeningStatus: text('ai_screening_status').$type<'pending' | 'processing' | 'completed' | 'error'>(),
  aiScreeningResult: text('ai_screening_result'), // JSON: {validity, confidence, classification}
  aiSuggestedReply: text('ai_suggested_reply'),
  aiExtractedIssues: text('ai_extracted_issues'), // JSON array
  aiKeywords: text('ai_keywords'), // JSON array
  vectorizeId: text('vectorize_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const replies = sqliteTable('replies', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id').notNull(),
  senderId: text('sender_id'),
  senderEmail: text('sender_email'),
  content: text('content').notNull(),
  internal: integer('internal', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull()
});

export const history = sqliteTable('history', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id').notNull(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  snapshot: text('snapshot'),
  createdAt: text('created_at').notNull()
});

// ==================== AI Feature Tables ====================

// AI Configuration - System-level settings for AI providers
export type AITaskType = 'agent' | 'prescreening' | 'prereply' | 'embedding';
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'xai' | 'deepseek';

export const aiConfigs = sqliteTable('ai_configs', {
  id: text('id').primaryKey(),
  taskType: text('task_type').$type<AITaskType>().notNull().unique(),
  provider: text('provider').$type<AIProvider>().notNull(),
  model: text('model').notNull(),
  apiKey: text('api_key').notNull(),
  baseUrl: text('base_url'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

// Product Documents - References to uploaded documents in R2
export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'error';

export const productDocuments = sqliteTable('product_documents', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  filename: text('filename').notNull(),
  r2Key: text('r2_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  status: text('status').$type<DocumentStatus>().default('pending'),
  errorMessage: text('error_message'),
  vectorizeIds: text('vectorize_ids'), // JSON array
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

// Product Knowledge - Manual text entries for AI context
export type KnowledgeType = 'description' | 'faq' | 'feature' | 'policy' | 'troubleshooting';

export const productKnowledge = sqliteTable('product_knowledge', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  knowledgeType: text('knowledge_type').$type<KnowledgeType>().notNull(),
  vectorizeIds: text('vectorize_ids'), // JSON array
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

// AI Chat Messages - Conversation history for AI Agent
export type ChatRole = 'user' | 'assistant' | 'tool';

export const aiChatMessages = sqliteTable('ai_chat_messages', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  sessionId: text('session_id').notNull(),
  role: text('role').$type<ChatRole>().notNull(),
  content: text('content').notNull(),
  toolCalls: text('tool_calls'), // JSON
  toolResults: text('tool_results'), // JSON
  createdAt: text('created_at').notNull()
});

// Ticket Tags - AI-generated, manual, or system tags
export type TagSource = 'ai' | 'manual' | 'system';

export const ticketTags = sqliteTable('ticket_tags', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id').notNull(),
  tag: text('tag').notNull(),
  source: text('source').$type<TagSource>().notNull(),
  confidence: real('confidence'), // AI confidence score 0-1
  createdAt: text('created_at').notNull()
});

// ==================== Type Exports ====================

export type TicketRow = typeof tickets.$inferSelect;
export type ReplyRow = typeof replies.$inferSelect;
export type TemplateRow = typeof templates.$inferSelect;
export type ProductKeyRow = typeof productKeys.$inferSelect;
export type CustomerRow = typeof customers.$inferSelect;
export type CategoryRouteRow = typeof categoryRoutes.$inferSelect;

// AI Feature Row Types
export type AIConfigRow = typeof aiConfigs.$inferSelect;
export type ProductDocumentRow = typeof productDocuments.$inferSelect;
export type ProductKnowledgeRow = typeof productKnowledge.$inferSelect;
export type AIChatMessageRow = typeof aiChatMessages.$inferSelect;
export type TicketTagRow = typeof ticketTags.$inferSelect;

