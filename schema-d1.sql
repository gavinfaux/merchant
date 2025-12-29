-- ============================================================
-- MERCHANT DATABASE SCHEMA (D1 / SQLite)
-- Auto-applied on first deploy, or run manually:
-- wrangler d1 execute merchant-db --file=schema-d1.sql
-- ============================================================

-- Stores
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('disabled', 'enabled')),
  stripe_secret_key TEXT,
  stripe_webhook_secret TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('public', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Variants (SKUs)
CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  weight_g INTEGER NOT NULL,
  dims_cm TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Inventory
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  sku TEXT NOT NULL,
  on_hand INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, sku)
);

-- Inventory Logs
CREATE TABLE IF NOT EXISTS inventory_logs (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  sku TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('restock', 'correction', 'damaged', 'return', 'sale', 'release')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Carts
CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'checked_out', 'expired')),
  customer_email TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  stripe_checkout_session_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cart Items
CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES carts(id),
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'canceled')),
  customer_email TEXT NOT NULL,
  ship_to TEXT,
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);

-- Refunds
CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  stripe_refund_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Events (webhook deduplication)
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  stripe_event_id TEXT UNIQUE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_variants_store_sku ON variants(store_id, sku);
CREATE INDEX IF NOT EXISTS idx_inventory_store_sku ON inventory(store_id, sku);
CREATE INDEX IF NOT EXISTS idx_carts_store ON carts(store_id);
CREATE INDEX IF NOT EXISTS idx_carts_expires ON carts(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);

