-- ============================================================
-- MERCHANT DATABASE SCHEMA (Postgres)
-- Use this if you need to scale beyond D1
-- Run: psql $DATABASE_URL < schema-postgres.sql
-- ============================================================

-- Stores
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('disabled', 'enabled')),
  stripe_secret_key TEXT,
  stripe_webhook_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('public', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Variants (SKUs)
CREATE TABLE variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  weight_g INTEGER NOT NULL,
  dims_cm JSONB,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventory
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  sku TEXT NOT NULL,
  on_hand INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, sku)
);

-- Inventory Logs
CREATE TABLE inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  sku TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('restock', 'correction', 'damaged', 'return', 'sale', 'release')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Carts
CREATE TABLE carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'checked_out', 'expired')),
  customer_email TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  stripe_checkout_session_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cart Items
CREATE TABLE cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES carts(id),
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'canceled')),
  customer_email TEXT NOT NULL,
  ship_to JSONB,
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order Items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);

-- Refunds
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  stripe_refund_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Events (webhook deduplication)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  stripe_event_id TEXT UNIQUE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_products_store ON products(store_id);
CREATE INDEX idx_variants_store_sku ON variants(store_id, sku);
CREATE INDEX idx_inventory_store_sku ON inventory(store_id, sku);
CREATE INDEX idx_carts_store ON carts(store_id);
CREATE INDEX idx_carts_expires ON carts(expires_at) WHERE status = 'open';
CREATE INDEX idx_orders_store ON orders(store_id);

