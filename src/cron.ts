import { getDb } from './db';
import { uuid, now, type Env } from './types';

// ============================================================
// CRON - Release expired reservations
// ============================================================

export async function handleCron(env: Env) {
  const db = getDb(env);
  const currentTime = now();

  // Find expired carts
  const expiredCarts = await db.query<any>(
    `SELECT * FROM carts WHERE status = 'open' AND expires_at < ?`,
    [currentTime]
  );

  for (const cart of expiredCarts) {
    const items = await db.query<any>(`SELECT * FROM cart_items WHERE cart_id = ?`, [cart.id]);

    // Release reserved inventory
    for (const item of items) {
      await db.run(
        `UPDATE inventory SET reserved = MAX(reserved - ?, 0), updated_at = ? WHERE store_id = ? AND sku = ?`,
        [item.qty, currentTime, cart.store_id, item.sku]
      );

      await db.run(
        `INSERT INTO inventory_logs (id, store_id, sku, delta, reason) VALUES (?, ?, ?, ?, 'release')`,
        [uuid(), cart.store_id, item.sku, -item.qty]
      );
    }

    // Mark cart expired
    await db.run(`UPDATE carts SET status = 'expired' WHERE id = ?`, [cart.id]);
  }

  console.log(`Released ${expiredCarts.length} expired carts`);
}
