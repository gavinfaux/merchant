import { Hono } from 'hono';
import { getDb } from '../db';
import { authMiddleware, adminOnly, hashKey, generateApiKey } from '../middleware/auth';
import { ApiError, uuid, now, type Env, type AuthContext } from '../types';

// ============================================================
// SETUP ROUTES
// ============================================================

export const setup = new Hono<{
  Bindings: Env;
  Variables: { auth: AuthContext };
}>();

// POST /v1/setup/store - Create a new store
setup.post('/store', authMiddleware, adminOnly, async (c) => {
  const body = await c.req.json();
  const name = body?.name;

  if (!name || typeof name !== 'string') {
    throw ApiError.invalidRequest('name is required');
  }

  const db = getDb(c.env);
  const storeId = uuid();

  await db.run(
    `INSERT INTO stores (id, name) VALUES (?, ?)`,
    [storeId, name]
  );

  // Generate API keys
  const publicKey = generateApiKey('pk');
  const adminKey = generateApiKey('sk');

  await db.run(
    `INSERT INTO api_keys (id, store_id, key_hash, key_prefix, role) VALUES (?, ?, ?, ?, ?)`,
    [uuid(), storeId, await hashKey(publicKey), 'pk_', 'public']
  );
  await db.run(
    `INSERT INTO api_keys (id, store_id, key_hash, key_prefix, role) VALUES (?, ?, ?, ?, ?)`,
    [uuid(), storeId, await hashKey(adminKey), 'sk_', 'admin']
  );

  return c.json({
    store: { id: storeId, name, status: 'enabled' },
    keys: {
      public: { key: publicKey, role: 'public' },
      admin: { key: adminKey, role: 'admin' },
    },
  });
});

// POST /v1/setup/stripe - Connect Stripe
setup.post('/stripe', authMiddleware, adminOnly, async (c) => {
  const body = await c.req.json();
  const stripeSecretKey = body?.stripe_secret_key;
  const stripeWebhookSecret = body?.stripe_webhook_secret;

  if (!stripeSecretKey?.startsWith('sk_')) {
    throw ApiError.invalidRequest('stripe_secret_key must start with sk_');
  }
  if (stripeWebhookSecret && !stripeWebhookSecret.startsWith('whsec_')) {
    throw ApiError.invalidRequest('stripe_webhook_secret must start with whsec_');
  }

  // Validate Stripe key
  const res = await fetch('https://api.stripe.com/v1/balance', {
    headers: { Authorization: `Bearer ${stripeSecretKey}` },
  });

  if (!res.ok) {
    throw ApiError.invalidRequest('Invalid Stripe secret key');
  }

  const { store } = c.get('auth');
  const db = getDb(c.env);

  await db.run(
    `UPDATE stores SET stripe_secret_key = ?, stripe_webhook_secret = ? WHERE id = ?`,
    [stripeSecretKey, stripeWebhookSecret || null, store.id]
  );

  return c.json({ ok: true });
});
