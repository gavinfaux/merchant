import { Hono } from 'hono';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, uuid, type Env, type AuthContext } from '../types';

// ============================================================
// IMAGE ROUTES
// ============================================================

export const images = new Hono<{
  Bindings: Env;
  Variables: { auth: AuthContext };
}>();

// GET is public (for serving images)
// POST/DELETE require admin auth

// POST /v1/images - Upload image (admin only)
images.post('/', authMiddleware, adminOnly, async (c) => {
  const { store } = c.get('auth');

  if (!c.env.IMAGES) {
    throw ApiError.invalidRequest('R2 bucket not configured');
  }

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) throw ApiError.invalidRequest('file is required');

  // Validate type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    throw ApiError.invalidRequest('File must be jpeg, png, webp, or gif');
  }

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    throw ApiError.invalidRequest('File must be under 5MB');
  }

  // Generate key
  const ext = file.type.split('/')[1];
  const key = `${store.id}/${uuid()}.${ext}`;

  // Upload to R2
  await c.env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Use configured URL or fall back to API endpoint for local dev
  const baseUrl = c.env.IMAGES_URL || `${new URL(c.req.url).origin}/v1/images`;
  const url = `${baseUrl}/${key}`;

  return c.json({ url, key });
});

// GET /v1/images/* - Serve image (for local dev, production uses R2 public URL)
images.get('/*', async (c) => {
  const key = c.req.path.replace('/v1/images/', '');

  if (!c.env.IMAGES) {
    throw ApiError.invalidRequest('R2 bucket not configured');
  }

  const object = await c.env.IMAGES.get(key);
  if (!object) {
    throw ApiError.notFound('Image not found');
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=31536000');

  return new Response(object.body, { headers });
});

// DELETE /v1/images/:key - Delete image (admin only)
images.delete('/*', authMiddleware, adminOnly, async (c) => {
  const { store } = c.get('auth');
  const key = c.req.path.replace('/v1/images/', '');

  if (!c.env.IMAGES) {
    throw ApiError.invalidRequest('R2 bucket not configured');
  }

  // Ensure key belongs to store
  if (!key.startsWith(`${store.id}/`)) {
    throw ApiError.forbidden('Cannot delete this image');
  }

  await c.env.IMAGES.delete(key);

  return c.json({ ok: true });
});
