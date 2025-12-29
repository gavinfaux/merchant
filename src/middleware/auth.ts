import { createMiddleware } from 'hono/factory';
import { getDb } from '../db';
import { ApiError, type AuthContext, type Env } from '../types';

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: { auth: AuthContext };
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);
  const db = getDb(c.env);
  const keyHash = await hashKey(token);

  const result = await db.query<any>(
    `SELECT s.*, k.role
     FROM api_keys k
     JOIN stores s ON k.store_id = s.id
     WHERE k.key_hash = ?
     LIMIT 1`,
    [keyHash]
  );

  if (result.length === 0) {
    throw ApiError.unauthorized('Invalid API key');
  }

  const row = result[0];
  
  if (row.status === 'disabled') {
    throw ApiError.forbidden('Store is disabled');
  }

  c.set('auth', {
    store: {
      id: row.id,
      name: row.name,
      status: row.status,
      stripe_secret_key: row.stripe_secret_key,
      stripe_webhook_secret: row.stripe_webhook_secret,
    },
    role: row.role,
  });

  await next();
});

// Require admin role
export const adminOnly = createMiddleware<{
  Bindings: Env;
  Variables: { auth: AuthContext };
}>(async (c, next) => {
  const auth = c.get('auth');
  
  if (auth.role !== 'admin') {
    throw ApiError.forbidden('Admin access required');
  }
  
  await next();
});

// Hash API key
export async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Generate API key
export function generateApiKey(prefix: 'pk' | 'sk'): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${key}`;
}
