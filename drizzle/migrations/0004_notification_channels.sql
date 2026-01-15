-- Notification channels configuration (per-product)
CREATE TABLE IF NOT EXISTS notification_channels (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  config TEXT NOT NULL,
  trigger_events TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_channels_product ON notification_channels(product_id);
CREATE INDEX IF NOT EXISTS idx_notification_channels_type ON notification_channels(channel_type);

-- Notification logs (track sent notifications)
CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_product ON notification_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_ticket ON notification_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_agent ON notification_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_channel ON notification_logs(channel_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
