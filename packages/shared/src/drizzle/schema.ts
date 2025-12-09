import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
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

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  title: text('title').notNull(),
  categories: text('categories').notNull(),
  formSchema: text('form_schema').notNull()
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

export type TicketRow = typeof tickets.$inferSelect;
export type ReplyRow = typeof replies.$inferSelect;
export type TemplateRow = typeof templates.$inferSelect;
export type ProductKeyRow = typeof productKeys.$inferSelect;

