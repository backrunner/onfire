-- Extend schema for customers, category routing, agent profiles
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  email TEXT NOT NULL,
  external_id TEXT,
  level INTEGER,
  meta TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_product ON customers (tenant_id, product_id);

CREATE TABLE IF NOT EXISTS category_routes (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  team_id TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE INDEX IF NOT EXISTS idx_category_routes_prod_cat ON category_routes (product_id, category, subcategory);

CREATE TABLE IF NOT EXISTS agent_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);





