import { type Env } from './types';

// ============================================================
// DATABASE CLIENT
// ============================================================

export type Database = {
  query: <T = any>(sql: string, params?: unknown[]) => Promise<T[]>;
  run: (sql: string, params?: unknown[]) => Promise<void>;
};

export function getDb(env: Env): Database {
  const db = env.DB;

  return {
    async query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await db.prepare(sql).bind(...params).all();
      return result.results as T[];
    },

    async run(sql: string, params: unknown[] = []): Promise<void> {
      await db.prepare(sql).bind(...params).run();
    },
  };
}

