-- AI Configuration (System-level)
-- SuperAdmin configures AI providers and models for different tasks
CREATE TABLE IF NOT EXISTS ai_configs (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL UNIQUE,      -- 'agent', 'prescreening', 'prereply', 'embedding'
  provider TEXT NOT NULL,               -- 'openai', 'anthropic', 'google', 'xai', 'deepseek'
  model TEXT NOT NULL,
  api_key TEXT NOT NULL,                -- Encrypted API key
  base_url TEXT,                        -- Custom base URL for OpenAI-compatible providers
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Product Documents (R2 references)
-- Stores references to uploaded documents in R2 for knowledge base
CREATE TABLE IF NOT EXISTS product_documents (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,                 -- R2 object key
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',        -- pending/processing/ready/error
  error_message TEXT,
  vectorize_ids TEXT,                   -- JSON array of Vectorize vector IDs
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_docs_product ON product_documents (product_id);
CREATE INDEX IF NOT EXISTS idx_product_docs_status ON product_documents (status);

-- Product Knowledge (FAQ, descriptions, feature docs)
-- Manual text entries for AI context
CREATE TABLE IF NOT EXISTS product_knowledge (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  knowledge_type TEXT NOT NULL,         -- 'description', 'faq', 'feature', 'policy', 'troubleshooting'
  vectorize_ids TEXT,                   -- JSON array of Vectorize vector IDs
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_knowledge_product ON product_knowledge (product_id);
CREATE INDEX IF NOT EXISTS idx_product_knowledge_type ON product_knowledge (knowledge_type);

-- AI Chat Messages
-- Stores conversation history for AI Agent chat
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,             -- Groups messages into conversations
  role TEXT NOT NULL,                   -- 'user', 'assistant', 'tool'
  content TEXT NOT NULL,
  tool_calls TEXT,                      -- JSON: tool invocation details
  tool_results TEXT,                    -- JSON: tool execution results
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session ON ai_chat_messages (user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON ai_chat_messages (created_at);

-- Ticket Tags
-- Tags can be AI-generated, manually added, or system-generated
CREATE TABLE IF NOT EXISTS ticket_tags (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  source TEXT NOT NULL,                 -- 'ai', 'manual', 'system'
  confidence REAL,                      -- AI confidence score (0-1), null for manual
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ticket_tags_ticket ON ticket_tags (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tags_tag ON ticket_tags (tag);
CREATE INDEX IF NOT EXISTS idx_ticket_tags_source ON ticket_tags (source);

-- Add AI-related columns to tickets table
ALTER TABLE tickets ADD COLUMN ai_screening_status TEXT;           -- 'pending', 'processing', 'completed', 'error'
ALTER TABLE tickets ADD COLUMN ai_screening_result TEXT;           -- JSON: {validity, confidence, classification}
ALTER TABLE tickets ADD COLUMN ai_suggested_reply TEXT;            -- AI-generated reply suggestion
ALTER TABLE tickets ADD COLUMN ai_extracted_issues TEXT;           -- JSON array: key issues extracted by AI
ALTER TABLE tickets ADD COLUMN ai_keywords TEXT;                   -- JSON array: keywords for search/filtering
ALTER TABLE tickets ADD COLUMN vectorize_id TEXT;                  -- Vectorize vector ID for semantic search

-- Index for AI screening status to find pending tickets
CREATE INDEX IF NOT EXISTS idx_tickets_ai_screening ON tickets (ai_screening_status);
