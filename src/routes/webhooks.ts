import { Hono } from 'hono';
import Stripe from 'stripe';
import { getDb } from '../db';
import { ApiError, uuid, now, type Env } from '../types';

// ============================================================
// WEBHOOK ROUTES
// ============================================================

export const webhooks = new Hono<{ Bindings: Env }>();

// POST /v1/webhooks/stripe
webhooks.post('/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  const body = await c.req.text();

  if (!signature) throw ApiError.invalidRequest('Missing stripe-signature header');

  let rawEvent: any;
  try {
    rawEvent = JSON.parse(body);
  } catch {
    throw ApiError.invalidRequest('Invalid JSON');
  }

  const storeId = rawEvent.data?.object?.metadata?.store_id;
  if (!storeId) throw ApiError.invalidRequest('Missing store_id in metadata');

  const db = getDb(c.env);

  const [store] = await db.query<any>(`SELECT * FROM stores WHERE id = ?`, [storeId]);
  if (!store?.stripe_webhook_secret) {
    throw ApiError.invalidRequest('Store not found or webhook secret missing');
  }

  // Verify signature
  const stripe = new Stripe(store.stripe_secret_key);
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, store.stripe_webhook_secret);
  } catch (e: any) {
    throw new ApiError('webhook_signature_invalid', 400, e.message);
  }

  // Dedupe
  const [existing] = await db.query<any>(`SELECT id FROM events WHERE stripe_event_id = ?`, [event.id]);
  if (existing) return c.json({ ok: true });

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const cartId = session.metadata?.cart_id;

    if (cartId) {
      const [cart] = await db.query<any>(`SELECT * FROM carts WHERE id = ?`, [cartId]);
      if (cart) {
        const items = await db.query<any>(`SELECT * FROM cart_items WHERE cart_id = ?`, [cartId]);

        // Generate order number
        const [countResult] = await db.query<any>(
          `SELECT COUNT(*) as count FROM orders WHERE store_id = ?`,
          [store.id]
        );
        const orderNumber = `ORD-${String(Number(countResult.count) + 1).padStart(4, '0')}`;

        // Create order
        const orderId = uuid();
        await db.run(
          `INSERT INTO orders (id, store_id, number, status, customer_email, ship_to,
           subtotal_cents, tax_cents, shipping_cents, total_cents, currency,
           stripe_checkout_session_id, stripe_payment_intent_id)
           VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId, store.id, orderNumber, cart.customer_email,
            session.shipping_details?.address ? JSON.stringify(session.shipping_details.address) : null,
            session.amount_subtotal ?? 0, session.total_details?.amount_tax ?? 0,
            session.total_details?.amount_shipping ?? 0, session.amount_total ?? 0, cart.currency,
            session.id, session.payment_intent
          ]
        );

        // Create order items & update inventory
        for (const item of items) {
          await db.run(
            `INSERT INTO order_items (id, order_id, sku, title, qty, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?)`,
            [uuid(), orderId, item.sku, item.title, item.qty, item.unit_price_cents]
          );

          await db.run(
            `UPDATE inventory SET reserved = reserved - ?, on_hand = on_hand - ?, updated_at = ? WHERE store_id = ? AND sku = ?`,
            [item.qty, item.qty, now(), store.id, item.sku]
          );

          await db.run(
            `INSERT INTO inventory_logs (id, store_id, sku, delta, reason) VALUES (?, ?, ?, ?, 'sale')`,
            [uuid(), store.id, item.sku, -item.qty]
          );
        }
      }
    }
  }

  // Log event
  await db.run(
    `INSERT INTO events (id, store_id, stripe_event_id, type, payload) VALUES (?, ?, ?, ?, ?)`,
    [uuid(), store.id, event.id, event.type, JSON.stringify(event.data.object)]
  );

  return c.json({ ok: true });
});
