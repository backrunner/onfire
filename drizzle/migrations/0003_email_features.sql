-- Email Configuration (Per-product)
-- Stores inbound and outbound email settings for each product
CREATE TABLE IF NOT EXISTS email_configs (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL UNIQUE,

  -- Inbound settings
  inbound_enabled INTEGER DEFAULT 0,
  inbound_provider TEXT,                    -- 'maileroo', 'sendgrid', 'mailgun', etc.
  inbound_address TEXT,                     -- e.g., 'support-product1@mail.onfire.app'
  inbound_webhook_secret TEXT,              -- For webhook signature validation

  -- Outbound settings
  outbound_enabled INTEGER DEFAULT 0,
  outbound_provider TEXT,                   -- 'resend', 'sendgrid', 'mailgun', 'maileroo', 'smtp'
  outbound_api_key TEXT,                    -- Encrypted API key
  outbound_smtp_host TEXT,                  -- For SMTP provider
  outbound_smtp_port INTEGER,
  outbound_smtp_user TEXT,
  outbound_smtp_pass TEXT,                  -- Encrypted
  outbound_sender_name TEXT,                -- e.g., 'OnFire Support'
  outbound_sender_email TEXT,               -- e.g., 'support@company.com'
  outbound_reply_to TEXT,                   -- Optional reply-to address

  -- AI filtering settings
  ai_filter_enabled INTEGER DEFAULT 1,      -- Enable AI spam/junk filtering
  ai_filter_strictness TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_configs_product ON email_configs (product_id);
CREATE INDEX IF NOT EXISTS idx_email_configs_inbound_address ON email_configs (inbound_address);

-- Email Templates (Per-product)
-- Customizable email templates for different notification types
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  template_type TEXT NOT NULL,              -- 'ticket_created', 'ticket_replied', 'ticket_closed', 'ticket_escalated'
  subject_template TEXT NOT NULL,           -- Subject with placeholders: {{ticket_id}}, {{subject}}
  body_template TEXT NOT NULL,              -- HTML body with placeholders
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE(product_id, template_type)
);
CREATE INDEX IF NOT EXISTS idx_email_templates_product ON email_templates (product_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates (template_type);

-- Inbound Email Log
-- Stores all received emails for audit and debugging
CREATE TABLE IF NOT EXISTS inbound_emails (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  message_id TEXT NOT NULL,                 -- Provider's message ID
  provider TEXT NOT NULL,                   -- 'maileroo', etc.

  -- Sender info
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,

  -- Content
  subject TEXT,
  body_plain TEXT,
  body_html TEXT,

  -- Processing result
  processing_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processed', 'filtered', 'error'
  filter_result TEXT,                       -- JSON: AI classification result
  ticket_id TEXT,                           -- Created ticket ID (if any)
  reply_id TEXT,                            -- Created reply ID (if reply to existing ticket)
  error_message TEXT,

  -- Security checks
  spf_result TEXT,
  dkim_result INTEGER,
  is_spam INTEGER,

  -- Raw payload for debugging
  raw_payload TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
  FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_product ON inbound_emails (product_id);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_status ON inbound_emails (processing_status);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_from ON inbound_emails (from_email);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_message_id ON inbound_emails (message_id);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_created ON inbound_emails (created_at);

-- Outbound Email Log
-- Tracks all sent emails for audit and delivery status
CREATE TABLE IF NOT EXISTS outbound_emails (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  ticket_id TEXT,
  reply_id TEXT,

  -- Email details
  to_email TEXT NOT NULL,
  to_name TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_plain TEXT,

  -- Delivery info
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending', 'sent', 'delivered', 'bounced', 'failed'
  error_message TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
  FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_outbound_emails_product ON outbound_emails (product_id);
CREATE INDEX IF NOT EXISTS idx_outbound_emails_ticket ON outbound_emails (ticket_id);
CREATE INDEX IF NOT EXISTS idx_outbound_emails_status ON outbound_emails (status);
CREATE INDEX IF NOT EXISTS idx_outbound_emails_created ON outbound_emails (created_at);

-- Add email-related columns to tickets table
ALTER TABLE tickets ADD COLUMN source TEXT DEFAULT 'web';           -- 'web', 'email', 'api'
ALTER TABLE tickets ADD COLUMN source_email_id TEXT;                -- Reference to inbound_emails.id

-- Add email-related columns to replies table
ALTER TABLE replies ADD COLUMN source TEXT DEFAULT 'web';           -- 'web', 'email'
ALTER TABLE replies ADD COLUMN source_email_id TEXT;                -- Reference to inbound_emails.id
ALTER TABLE replies ADD COLUMN email_sent INTEGER DEFAULT 0;        -- Whether notification was sent
