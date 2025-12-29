// ============================================================
// TYPES
// ============================================================

export type Env = {
  // D1 (default)
  DB: D1Database;
  // Postgres (optional, for scale)
  HYPERDRIVE?: Hyperdrive;
  DATABASE_URL?: string;
  // R2 images
  IMAGES?: R2Bucket;
  IMAGES_URL?: string;
};

export type Store = {
  id: string;
  name: string;
  status: 'disabled' | 'enabled';
  stripe_secret_key: string | null;
  stripe_webhook_secret: string | null;
};

export type ApiKeyRole = 'public' | 'admin';

export type AuthContext = {
  store: Store;
  role: ApiKeyRole;
};

// ============================================================
// ERRORS
// ============================================================

export class ApiError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError('unauthorized', 401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError('forbidden', 403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError('not_found', 404, message);
  }

  static invalidRequest(message: string, details?: Record<string, unknown>) {
    return new ApiError('invalid_request', 400, message, details);
  }

  static conflict(message: string) {
    return new ApiError('conflict', 409, message);
  }

  static insufficientInventory(sku: string) {
    return new ApiError('insufficient_inventory', 409, `Insufficient inventory for SKU: ${sku}`, { sku });
  }

  static stripeError(message: string) {
    return new ApiError('stripe_error', 502, message);
  }
}

// ============================================================
// HELPERS
// ============================================================

export function uuid(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
