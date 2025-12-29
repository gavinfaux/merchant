# Merchant API Reference

A complete REST API for commerce. Products, inventory, carts, checkout, orders.

## Base URL

```
Local: http://localhost:8787
```

## Authentication

```
Authorization: Bearer <api_key>
```

| Key | Role | Access |
|-----|------|--------|
| `pk_...` | Public | Carts, checkout |
| `sk_...` | Admin | Everything |

---

## Products

### List Products

```http
GET /v1/products
```

### Create Product

```http
POST /v1/products

{
  "title": "T-Shirt",
  "description": "Premium cotton"
}
```

### Update Product

```http
PATCH /v1/products/:id

{
  "title": "New Title",
  "status": "draft"
}
```

### Add Variant

```http
POST /v1/products/:id/variants

{
  "sku": "TEE-BLK-M",
  "title": "Black / M",
  "price_cents": 2999
}
```

---

## Inventory

### List Inventory

```http
GET /v1/inventory
```

### Get SKU

```http
GET /v1/inventory?sku=TEE-BLK-M
```

### Adjust Inventory

```http
POST /v1/inventory/:sku/adjust

{
  "delta": 50,
  "reason": "restock"
}
```

Reasons: `restock`, `correction`, `damaged`, `return`

---

## Carts

### Create Cart

```http
POST /v1/carts

{
  "customer_email": "buyer@example.com"
}
```

### Add Items

```http
POST /v1/carts/:id/items

{
  "items": [
    {"sku": "TEE-BLK-M", "qty": 2}
  ]
}
```

### Checkout

```http
POST /v1/carts/:id/checkout

{
  "success_url": "https://site.com/thanks",
  "cancel_url": "https://site.com/cart"
}
```

Returns `checkout_url` — redirect customer there.

---

## Orders

### List Orders

```http
GET /v1/orders
```

### Get Order

```http
GET /v1/orders/:id
```

### Refund

```http
POST /v1/orders/:id/refund

{
  "amount_cents": 2999
}
```

Omit amount for full refund.

### Test Order

```http
POST /v1/orders/test

{
  "customer_email": "test@example.com",
  "items": [{"sku": "TEE-BLK-M", "qty": 1}]
}
```

---

## Images

### Upload

```http
POST /v1/images
Content-Type: multipart/form-data

file: <image>
```

Max 5MB. jpeg, png, webp, gif.

### Delete

```http
DELETE /v1/images/:key
```

---

## Setup

### Connect Stripe

```http
POST /v1/setup/stripe

{
  "stripe_secret_key": "sk_test_...",
  "stripe_webhook_secret": "whsec_..."
}
```

---

## Webhooks

Endpoint: `POST /v1/webhooks/stripe`

Events: `checkout.session.completed`

---

## Errors

```json
{
  "error": {
    "code": "not_found",
    "message": "Product not found"
  }
}
```

| Code | Status |
|------|--------|
| `unauthorized` | 401 |
| `forbidden` | 403 |
| `not_found` | 404 |
| `invalid_request` | 400 |
| `conflict` | 409 |
| `insufficient_inventory` | 409 |

