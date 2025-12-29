import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { setup } from './routes/setup';
import { catalog } from './routes/catalog';
import { inventory } from './routes/inventory';
import { checkout } from './routes/checkout';
import { orders } from './routes/orders';
import { webhooks } from './routes/webhooks';
import { images } from './routes/images';
import { handleCron } from './cron';
import { ApiError, type Env } from './types';

// ============================================================
// MERCHANT API
// ============================================================

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// Error handler
app.onError((err, c) => {
  console.error(err);

  if (err instanceof ApiError) {
    return c.json(
      { error: { code: err.code, message: err.message, ...(err.details && { details: err.details }) } },
      err.statusCode as any
    );
  }

  return c.json({ error: { code: 'internal', message: 'Internal server error' } }, 500);
});

// Health
app.get('/', (c) => c.json({ name: 'merchant', version: '0.1.0', ok: true }));

// Routes
app.route('/v1/setup', setup);
app.route('/v1/products', catalog);
app.route('/v1/inventory', inventory);
app.route('/v1/carts', checkout);
app.route('/v1/orders', orders);
app.route('/v1/webhooks', webhooks);
app.route('/v1/images', images);

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleCron(env));
  },
};
