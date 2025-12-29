import { Hono } from 'hono';
import { getDb } from '../db';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, uuid, now, type Env, type AuthContext } from '../types';

// ============================================================
// CATALOG ROUTES (Products & Variants)
// ============================================================

const catalogRoutes = new Hono<{
  Bindings: Env;
  Variables: { auth: AuthContext };
}>();

catalogRoutes.use('*', authMiddleware);

// GET /v1/products
catalogRoutes.get('/', async (c) => {
  const { store } = c.get('auth');
  const db = getDb(c.env);

  const products = await db.query<any>(
    `SELECT * FROM products WHERE store_id = ? ORDER BY created_at DESC`,
    [store.id]
  );

  const items = await Promise.all(
    products.map(async (p) => {
      const variants = await db.query<any>(
        `SELECT * FROM variants WHERE product_id = ? ORDER BY created_at ASC`,
        [p.id]
      );
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        created_at: p.created_at,
        variants: variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          title: v.title,
          price_cents: v.price_cents,
          image_url: v.image_url,
        })),
      };
    })
  );

  return c.json({ items });
});

// GET /v1/products/:id
catalogRoutes.get('/:id', async (c) => {
  const { store } = c.get('auth');
  const db = getDb(c.env);
  const id = c.req.param('id');

  const [product] = await db.query<any>(
    `SELECT * FROM products WHERE id = ? AND store_id = ?`,
    [id, store.id]
  );

  if (!product) throw ApiError.notFound('Product not found');

  const variants = await db.query<any>(
    `SELECT * FROM variants WHERE product_id = ? ORDER BY created_at ASC`,
    [id]
  );

  return c.json({
    id: product.id,
    title: product.title,
    description: product.description,
    status: product.status,
    created_at: product.created_at,
    variants: variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.title,
      price_cents: v.price_cents,
      image_url: v.image_url,
    })),
  });
});

// POST /v1/products (admin only)
catalogRoutes.post('/', adminOnly, async (c) => {
  const body = await c.req.json();
  const { title, description } = body;

  if (!title) throw ApiError.invalidRequest('title is required');

  const { store } = c.get('auth');
  const db = getDb(c.env);

  const id = uuid();
  const timestamp = now();

  await db.run(
    `INSERT INTO products (id, store_id, title, description, status, created_at)
     VALUES (?, ?, ?, ?, 'active', ?)`,
    [id, store.id, title, description || null, timestamp]
  );

  return c.json({ id, title, description: description || null, status: 'active', variants: [] }, 201);
});

// PATCH /v1/products/:id (admin only)
catalogRoutes.patch('/:id', adminOnly, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { title, description, status } = body;

  const { store } = c.get('auth');
  const db = getDb(c.env);

  const [existing] = await db.query<any>(
    `SELECT * FROM products WHERE id = ? AND store_id = ?`,
    [id, store.id]
  );

  if (!existing) throw ApiError.notFound('Product not found');

  const updates: string[] = [];
  const params: unknown[] = [];

  if (title !== undefined) {
    updates.push('title = ?');
    params.push(title);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description);
  }
  if (status !== undefined) {
    if (!['active', 'draft'].includes(status)) {
      throw ApiError.invalidRequest('status must be active or draft');
    }
    updates.push('status = ?');
    params.push(status);
  }

  if (updates.length > 0) {
    params.push(id);
    params.push(store.id);

    await db.run(
      `UPDATE products SET ${updates.join(', ')} WHERE id = ? AND store_id = ?`,
      params
    );
  }

  const [product] = await db.query<any>(
    `SELECT * FROM products WHERE id = ? AND store_id = ?`,
    [id, store.id]
  );

  const variants = await db.query<any>(
    `SELECT * FROM variants WHERE product_id = ?`,
    [id]
  );

  return c.json({
    id: product.id,
    title: product.title,
    description: product.description,
    status: product.status,
    variants: variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.title,
      price_cents: v.price_cents,
      image_url: v.image_url,
    })),
  });
});

// POST /v1/products/:id/variants (admin only)
catalogRoutes.post('/:id/variants', adminOnly, async (c) => {
  const productId = c.req.param('id');
  const body = await c.req.json();
  const { sku, title, price_cents, image_url } = body;

  if (!sku) throw ApiError.invalidRequest('sku is required');
  if (!title) throw ApiError.invalidRequest('title is required');
  if (typeof price_cents !== 'number' || price_cents < 0) {
    throw ApiError.invalidRequest('price_cents must be a positive number');
  }

  const { store } = c.get('auth');
  const db = getDb(c.env);

  // Check product exists
  const [product] = await db.query<any>(
    `SELECT * FROM products WHERE id = ? AND store_id = ?`,
    [productId, store.id]
  );
  if (!product) throw ApiError.notFound('Product not found');

  // Check SKU uniqueness for this store
  const [existingSku] = await db.query<any>(
    `SELECT * FROM variants WHERE sku = ? AND store_id = ?`,
    [sku, store.id]
  );
  if (existingSku) throw ApiError.conflict(`SKU ${sku} already exists`);

  const id = uuid();
  const timestamp = now();

  // Insert variant (with required fields)
  await db.run(
    `INSERT INTO variants (id, product_id, store_id, sku, title, price_cents, weight_g, image_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, productId, store.id, sku, title, price_cents, 0, image_url || null, timestamp]
  );

  // Create inventory record
  await db.run(
    `INSERT INTO inventory (id, store_id, sku, on_hand, reserved, updated_at)
     VALUES (?, ?, ?, 0, 0, ?)`,
    [uuid(), store.id, sku, timestamp]
  );

  return c.json({ id, sku, title, price_cents, image_url: image_url || null }, 201);
});

export { catalogRoutes as catalog };
