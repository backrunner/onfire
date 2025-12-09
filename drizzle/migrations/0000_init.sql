-- Generated initial schema (Drizzle-managed)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_team_id TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sla_high_accept INTEGER,
  sla_high_reply INTEGER,
  sla_medium_accept INTEGER,
  sla_medium_reply INTEGER,
  sla_low_accept INTEGER,
  sla_low_reply INTEGER,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  allow_reassign INTEGER DEFAULT 1,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS product_teams (
  product_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  PRIMARY KEY (product_id, team_id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin','tenant_admin','product_admin','team_admin','agent')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS agents (
  user_id TEXT PRIMARY KEY,
  level INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS agent_teams (
  user_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  PRIMARY KEY (user_id, team_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  categories TEXT NOT NULL,
  form_schema TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS product_keys (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  name TEXT,
  secret TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked INTEGER DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  assignee_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('new','processing','replied','closed','escalated')),
  priority TEXT NOT NULL CHECK (priority IN ('high','medium','low')),
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

CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  snapshot TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

