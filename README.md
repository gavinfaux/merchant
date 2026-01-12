# merchant

**The open-source commerce backend for Cloudflare + Stripe. Bring a Stripe key. Start selling.**

A lightweight, API-first backend for products, inventory, checkout, and orders—designed to run on Cloudflare Workers with Stripe handling payments.

## Quick Start

```bash
# 1. Clone & Install
git clone https://github.com/ygwyg/merchant
cd merchant && npm install

# 2. Initialize (creates API keys)
npx tsx scripts/init.ts

# 3. Start the API
npm run dev

# 4. Seed demo data (optional)
npx tsx scripts/seed.ts http://localhost:8787 sk_your_admin_key

# 5. Connect Stripe
curl -X POST http://localhost:8787/v1/setup/stripe \
  -H "Authorization: Bearer sk_your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{"stripe_secret_key":"sk_test_..."}'

# 6. Admin dashboard
cd admin && npm install && npm run dev
```

## Deploy to Cloudflare

Durable Objects and R2 are **auto-provisioned** on first deploy — no manual setup required!

```bash
# Deploy (Durable Object + R2 bucket created automatically)
wrangler deploy

# Run init script against production
npx tsx scripts/init.ts --remote
```

## API Reference

All endpoints require `Authorization: Bearer <key>` header.

- `pk_...` → Public key. Can create carts and checkout.
- `sk_...` → Admin key. Full access to everything.

### Products (admin)

```bash
# List products (with pagination)
GET /v1/products?limit=20&cursor=...&status=active

# Get single product
GET /v1/products/{id}

# Create product
POST /v1/products
{"title": "T-Shirt", "description": "Premium cotton tee"}

# Update product
PATCH /v1/products/{id}
{"title": "Updated Title", "status": "draft"}

# Delete product (fails if variants have been ordered)
DELETE /v1/products/{id}

# Add variant
POST /v1/products/{id}/variants
{"sku": "TEE-BLK-M", "title": "Black / M", "price_cents": 2999}

# Update variant
PATCH /v1/products/{id}/variants/{variantId}
{"price_cents": 3499}

# Delete variant (fails if ordered)
DELETE /v1/products/{id}/variants/{variantId}
```

### Inventory (admin)

```bash
# List inventory (with pagination)
GET /v1/inventory?limit=100&cursor=...&low_stock=true

# Get single SKU
GET /v1/inventory?sku=TEE-BLK-M

# Adjust inventory
POST /v1/inventory/{sku}/adjust
{"delta": 100, "reason": "restock"}
# reason: restock | correction | damaged | return
```

**Query params:**

- `limit` — Max items per page (default 100, max 500)
- `cursor` — Pagination cursor (SKU of last item)
- `low_stock` — Filter items with ≤10 available

### Checkout (public)

```bash
# Create cart
POST /v1/carts
{"customer_email": "buyer@example.com"}

# Get cart
GET /v1/carts/{id}

# Add items to cart (replaces existing items)
POST /v1/carts/{id}/items
{"items": [{"sku": "TEE-BLK-M", "qty": 2}]}

# Checkout → returns Stripe URL
POST /v1/carts/{id}/checkout
{
  "success_url": "https://...",
  "cancel_url": "https://...",
  "collect_shipping": true,
  "shipping_countries": ["US", "CA", "GB"]
}
```

**Checkout options:**

- `collect_shipping` — Enable shipping address collection
- `shipping_countries` — Allowed countries (default: `["US"]`)
- `shipping_options` — Custom shipping rates (optional, has sensible defaults)

Automatic tax calculation is enabled via Stripe Tax.

### Customers (admin)

```bash
# List customers (with pagination and search)
GET /v1/customers?limit=20&cursor=...&search=john@example.com

# Get customer with addresses
GET /v1/customers/{id}

# Get customer's order history
GET /v1/customers/{id}/orders

# Update customer
PATCH /v1/customers/{id}
{"name": "John Doe", "phone": "+1234567890"}

# Add address
POST /v1/customers/{id}/addresses
{"line1": "123 Main St", "city": "NYC", "postal_code": "10001"}

# Delete address
DELETE /v1/customers/{id}/addresses/{addressId}
```

Customers are automatically created from Stripe checkout sessions (guest checkout by email).

### Orders (admin)

```bash
# List orders (with pagination and filters)
GET /v1/orders?limit=20&cursor=...&status=shipped&email=customer@example.com

# Get order details
GET /v1/orders/{id}

# Update order status/tracking
PATCH /v1/orders/{id}
{"status": "shipped", "tracking_number": "1Z999...", "tracking_url": "https://..."}

# Refund order
POST /v1/orders/{id}/refund
{"amount_cents": 1000}  # optional, omit for full refund

# Create test order (skips Stripe, for testing)
POST /v1/orders/test
{"customer_email": "test@example.com", "items": [{"sku": "TEE-BLK-M", "qty": 1}]}
```

**Order statuses:** `pending` → `paid` → `processing` → `shipped` → `delivered` | `refunded` | `canceled`

### Images (admin)

```bash
# Upload image
POST /v1/images
Content-Type: multipart/form-data
file: <image file>
# Returns: {"url": "...", "key": "..."}

# Delete image
DELETE /v1/images/{key}
```

### Setup (admin)

```bash
# Connect Stripe
POST /v1/setup/stripe
{"stripe_secret_key": "sk_...", "stripe_webhook_secret": "whsec_..."}
```

### Outbound Webhooks (admin)

```bash
# List webhooks
GET /v1/webhooks

# Create webhook
POST /v1/webhooks
{"url": "https://your-server.com/webhook", "events": ["order.created", "order.shipped"]}

# Get webhook (includes recent deliveries)
GET /v1/webhooks/{id}

# Update webhook
PATCH /v1/webhooks/{id}
{"events": ["*"], "status": "paused"}

# Rotate secret
POST /v1/webhooks/{id}/rotate-secret

# Delete webhook
DELETE /v1/webhooks/{id}
```

**Events:** `order.created`, `order.updated`, `order.shipped`, `order.refunded`, `inventory.low`

**Wildcards:** `order.*` or `*` for all events

Payloads are signed with HMAC-SHA256. Verify with the `X-Merchant-Signature` header.

## UCP (Universal Commerce Protocol)

Merchant implements the [Universal Commerce Protocol](https://ucp.dev) for AI agent-to-commerce interoperability. UCP enables AI agents to discover, browse, and transact with any UCP-compliant merchant through a standard protocol.

### UCP Discovery

```bash
# Get UCP profile with capabilities, services, and payment handlers
GET /.well-known/ucp
```

Response includes:
- **Capabilities**: `dev.ucp.shopping.checkout`, `dev.ucp.common.identity_linking`, `dev.ucp.shopping.order`
- **Services**: REST endpoints for shopping operations
- **Payment Handlers**: Stripe Checkout (redirect-based)

### UCP Checkout Flow (for AI agents)

```bash
# 1. Create checkout session
POST /ucp/v1/checkout-sessions
{
  "currency": "USD",
  "line_items": [
    {"item": {"id": "TEE-BLK-M"}, "quantity": 2}
  ],
  "buyer": {"email": "buyer@example.com"}
}

# 2. Complete checkout (returns Stripe redirect URL)
POST /ucp/v1/checkout-sessions/{id}/complete
{
  "payment_data": {
    "handler_id": "stripe_checkout",
    "success_url": "https://your-app.com/success",
    "cancel_url": "https://your-app.com/cancel"
  }
}

# 3. Agent presents continue_url to user for payment
```

### UCP Checkout Session Lifecycle

| Status | Description |
|--------|-------------|
| `incomplete` | Session created, items may have validation errors |
| `requires_escalation` | Human interaction needed (payment redirect) |
| `ready_for_complete` | Session can be completed |
| `complete_in_progress` | Payment processing |
| `completed` | Order created successfully |
| `canceled` | Session canceled |

### UCP Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/.well-known/ucp` | Profile discovery |
| POST | `/ucp/v1/checkout-sessions` | Create checkout |
| GET | `/ucp/v1/checkout-sessions/:id` | Get checkout |
| PUT | `/ucp/v1/checkout-sessions/:id` | Update checkout |
| POST | `/ucp/v1/checkout-sessions/:id/complete` | Complete checkout |
| DELETE | `/ucp/v1/checkout-sessions/:id` | Cancel checkout |

All UCP responses include a `ucp` envelope with version and active capabilities.

## OAuth 2.0 (for platforms)

Merchant supports OAuth 2.0 for platforms to act on behalf of customers. **Zero configuration required** — works out of the box.

### Discovery

```bash
GET /.well-known/oauth-authorization-server
```

### Authorization Flow (PKCE required)

```bash
# 1. Redirect user to authorize
GET /oauth/authorize?
  client_id=your-app&
  redirect_uri=https://your-app.com/callback&
  response_type=code&
  scope=openid%20profile%20checkout&
  code_challenge=BASE64URL(SHA256(verifier))&
  code_challenge_method=S256&
  state=random-state

# 2. User authenticates via magic link (email)

# 3. Exchange code for tokens
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=AUTH_CODE&
redirect_uri=https://your-app.com/callback&
client_id=your-app&
code_verifier=ORIGINAL_VERIFIER
```

### Scopes

| Scope | Access |
|-------|--------|
| `openid` | Verify identity |
| `profile` | Name and email |
| `checkout` | Create orders on behalf of user |
| `orders.read` | View order history |
| `orders.write` | Manage orders |
| `addresses.read` | Access saved addresses |
| `addresses.write` | Manage addresses |

### Using Access Tokens

```bash
curl https://your-store.com/v1/orders \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

Tokens work alongside API keys — existing integrations are unaffected.

## Stripe Webhooks

Set your Stripe webhook endpoint to `https://your-domain/v1/webhooks/stripe`

Events handled:

- `checkout.session.completed` → Creates order, deducts inventory

For local development:

```bash
stripe listen --forward-to localhost:8787/v1/webhooks/stripe
```

## Rate Limiting

All endpoints return rate limit headers:

- `X-RateLimit-Limit` — Requests allowed per window
- `X-RateLimit-Remaining` — Requests remaining
- `X-RateLimit-Reset` — Unix timestamp when window resets

Limits are configurable in `src/config/rate-limits.ts`.

## Admin Dashboard

```bash
cd admin && npm install && npm run dev
```

Connect with your API URL and admin key (`sk_...`).

## Example Store

A complete vanilla JS storefront demonstrating the full checkout flow:

```bash
cd example && npm run dev
```

Update `example/src/config.js` with your public key (`pk_...`), then open http://localhost:3000

Features:

- **Orders** — Search, filter by status, update tracking, one-click refunds
- **Inventory** — View stock levels, quick adjustments (+10, +50, etc.)
- **Products** — Create products, add/edit variants, upload images
- **Webhooks** — Create endpoints, view delivery history, rotate secrets
- Light/dark mode, collapsible sidebar

## Real-time Updates (WebSocket)

Connect to the WebSocket endpoint for live updates:

```javascript
const ws = new WebSocket('wss://your-store.com/ws?topics=cart,order,inventory');

ws.onmessage = (event) => {
  const { type, data, timestamp } = JSON.parse(event.data);
  console.log(`Event: ${type}`, data);
};

// Subscribe/unsubscribe dynamically
ws.send(JSON.stringify({ action: 'subscribe', topic: 'order' }));
ws.send(JSON.stringify({ action: 'unsubscribe', topic: 'cart' }));
```

**Event types:** `cart.updated`, `cart.checked_out`, `order.created`, `order.updated`, `order.shipped`, `order.refunded`, `inventory.updated`, `inventory.low`

**Topics:** `cart`, `order`, `inventory`, or `*` for all events.

## Architecture

```
src/
├── index.ts          # Entry point, routes
├── do.ts             # Durable Object with SQLite + WebSocket
├── db.ts             # Database wrapper
├── types.ts          # Types and errors
├── middleware/
│   └── auth.ts       # API key + OAuth auth
└── routes/
    ├── catalog.ts    # Products & variants
    ├── checkout.ts   # Carts & Stripe checkout
    ├── orders.ts     # Order management
    ├── inventory.ts  # Stock levels
    ├── customers.ts  # Customer management
    ├── images.ts     # R2 image upload
    ├── setup.ts      # Store configuration
    ├── webhooks.ts   # Stripe webhooks
    ├── oauth.ts      # OAuth 2.0 support
    └── ucp.ts        # UCP (Universal Commerce Protocol)
```

## Stack

| Component | Technology                    |
| --------- | ----------------------------- |
| Runtime   | Cloudflare Workers            |
| Framework | Hono                          |
| Database  | Durable Objects (SQLite)      |
| Real-time | WebSocket (DO native)         |
| Images    | R2                            |
| Payments  | Stripe                        |

## Migrating from D1

If you're upgrading from an older version that used D1, use the migration script:

```bash
# 1. Export your D1 data
npx tsx scripts/migrate-d1-to-do.ts export --remote --db=merchant-db

# 2. Deploy the new DO-based version
wrangler deploy

# 3. Initialize new API keys
npx tsx scripts/init.ts --remote

# 4. Import your data
npx tsx scripts/migrate-d1-to-do.ts import --file=d1-export-xxx.json --url=https://your-store.workers.dev --key=sk_...
```

The migration imports products, variants, inventory, and discounts. Orders are exported for reference but not re-imported (they're historical records). API keys and OAuth tokens must be regenerated.

## Scaling

For most stores, a single Durable Object handles everything. If you outgrow it:

1. **Postgres migration**: Use `schema-postgres.sql` for a traditional DB setup
2. **Multi-DO sharding**: Split by entity type (carts, orders, inventory)

## License

MIT
