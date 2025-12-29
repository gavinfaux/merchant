import { Hono } from 'hono';
import { getDb } from '../db';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, uuid, now, type Env, type AuthContext } from '../types';

// ============================================================
// INVENTORY ROUTES
// ============================================================

const inventoryRoutes = new Hono<{
  Bindings: Env;
  Variables: { auth: AuthContext };
}>();

inventoryRoutes.use('*', authMiddleware, adminOnly);

// GET /v1/inventory - List all inventory (optionally filter by sku)
inventoryRoutes.get('/', async (c) => {
  const sku = c.req.query('sku');
  const { store } = c.get('auth');
  const db = getDb(c.env);

  // If sku provided, return single item
  if (sku) {
    const [level] = await db.query<any>(
      `SELECT * FROM inventory WHERE store_id = ? AND sku = ?`,
      [store.id, sku]
    );

    if (!level) throw ApiError.notFound('SKU not found');

    return c.json({
      sku: level.sku,
      on_hand: level.on_hand,
      reserved: level.reserved,
      available: level.on_hand - level.reserved,
    });
  }

  // Otherwise return all inventory with variant/product info
  const items = await db.query<any>(
    `SELECT i.*, v.title as variant_title, p.title as product_title
     FROM inventory i
     LEFT JOIN variants v ON i.sku = v.sku AND v.store_id = i.store_id
     LEFT JOIN products p ON v.product_id = p.id
     WHERE i.store_id = ?
     ORDER BY i.sku`,
    [store.id]
  );

  return c.json({
    items: items.map((i) => ({
      sku: i.sku,
      on_hand: i.on_hand,
      reserved: i.reserved,
      available: i.on_hand - i.reserved,
      variant_title: i.variant_title,
      product_title: i.product_title,
    })),
  });
});

// POST /v1/inventory/:sku/adjust
inventoryRoutes.post('/:sku/adjust', async (c) => {
  const sku = c.req.param('sku');
  const body = await c.req.json();
  const { delta, reason } = body;

  if (typeof delta !== 'number') throw ApiError.invalidRequest('delta is required');
  if (!['restock', 'correction', 'damaged', 'return'].includes(reason)) {
    throw ApiError.invalidRequest('reason must be restock, correction, damaged, or return');
  }

  const { store } = c.get('auth');
  const db = getDb(c.env);

  // Check exists
  const [existing] = await db.query<any>(
    `SELECT * FROM inventory WHERE store_id = ? AND sku = ?`,
    [store.id, sku]
  );
  if (!existing) throw ApiError.notFound('SKU not found');

  // Update
  await db.run(
    `UPDATE inventory SET on_hand = on_hand + ?, updated_at = ? WHERE store_id = ? AND sku = ?`,
    [delta, now(), store.id, sku]
  );

  // Log
  await db.run(
    `INSERT INTO inventory_logs (id, store_id, sku, delta, reason) VALUES (?, ?, ?, ?, ?)`,
    [uuid(), store.id, sku, delta, reason]
  );

  // Fetch updated
  const [level] = await db.query<any>(
    `SELECT * FROM inventory WHERE store_id = ? AND sku = ?`,
    [store.id, sku]
  );

  return c.json({
    sku: level.sku,
    on_hand: level.on_hand,
    reserved: level.reserved,
    available: level.on_hand - level.reserved,
  });
});

export { inventoryRoutes as inventory };
