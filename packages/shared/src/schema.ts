import { Role, TicketPriority, TicketStatus } from './index';

export const schema = {
  tenants: `
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      default_team_id TEXT
    );
  `,
  products: `
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sla_high_accept INTEGER DEFAULT 5,
      sla_high_reply INTEGER DEFAULT 20,
      sla_medium_accept INTEGER DEFAULT 10,
      sla_medium_reply INTEGER DEFAULT 60,
      sla_low_accept INTEGER DEFAULT 30,
      sla_low_reply INTEGER DEFAULT 180,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
  `,
  teams: `
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      allow_reassign INTEGER DEFAULT 1,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
  `,
  product_teams: `
    CREATE TABLE IF NOT EXISTS product_teams (
      product_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      PRIMARY KEY (product_id, team_id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );
  `,
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('${Role.SuperAdmin}','${Role.TenantAdmin}','${Role.ProductAdmin}','${Role.TeamAdmin}','${Role.Agent}')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
  `,
  agents: `
    CREATE TABLE IF NOT EXISTS agents (
      user_id TEXT PRIMARY KEY,
      level INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `,
  agent_teams: `
    CREATE TABLE IF NOT EXISTS agent_teams (
      user_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      PRIMARY KEY (user_id, team_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );
  `,
  templates: `
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      title TEXT NOT NULL,
      categories TEXT NOT NULL,
      form_schema TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `,
  tickets: `
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      assignee_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('${TicketStatus.New}','${TicketStatus.Processing}','${TicketStatus.Replied}','${TicketStatus.Closed}','${TicketStatus.Escalated}')),
      priority TEXT NOT NULL CHECK (priority IN ('${TicketPriority.High}','${TicketPriority.Medium}','${TicketPriority.Low}')),
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_level INTEGER,
      template_id TEXT,
      metadata TEXT,
      sla_accept_deadline TEXT,
      sla_reply_deadline TEXT,
      sla_accept_breached INTEGER DEFAULT 0,
      sla_reply_breached INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (assignee_id) REFERENCES users(id)
    );
  `,
  replies: `
    CREATE TABLE IF NOT EXISTS replies (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      sender_id TEXT,
      sender_email TEXT,
      content TEXT NOT NULL,
      internal INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
  `,
  history: `
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      actor_id TEXT,
      action TEXT NOT NULL,
      snapshot TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
  `
} as const;

export const seedSql = `
  INSERT OR IGNORE INTO tenants (id, name, default_team_id) VALUES ('demo-tenant', 'Demo Tenant', 'team-default');
  INSERT OR IGNORE INTO products (id, tenant_id, name) VALUES ('demo-product', 'demo-tenant', 'Demo Product');
  INSERT OR IGNORE INTO teams (id, tenant_id, name, allow_reassign) VALUES ('team-default', 'demo-tenant', 'Default Team', 1);
  INSERT OR IGNORE INTO product_teams (product_id, team_id) VALUES ('demo-product', 'team-default');
  INSERT OR IGNORE INTO users (id, email, display_name, tenant_id, role) VALUES
    ('admin-1', 'admin@demo.dev', 'Demo Admin', 'demo-tenant', '${Role.TeamAdmin}'),
    ('agent-1', 'agent@demo.dev', 'Demo Agent', 'demo-tenant', '${Role.Agent}');
  INSERT OR IGNORE INTO agents (user_id, level, active) VALUES ('agent-1', 1, 1);
  INSERT OR IGNORE INTO agent_teams (user_id, team_id) VALUES ('agent-1', 'team-default');
  INSERT OR IGNORE INTO templates (id, product_id, title, categories, form_schema) VALUES
    ('tmpl-default', 'demo-product', '默认模版', '通用', '{"fields": []}');
`;

