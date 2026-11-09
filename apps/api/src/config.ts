import { resolve } from 'node:path';
import { z } from 'zod';
export interface Config { databaseUrl: string; appSecret: string; origin: string; host: string; port: number; production: boolean; mediaDir: string }
export function readConfig(env = process.env): Config {
  const parsed = z.object({ databaseUrl: z.url(), appSecret: z.string().regex(/^[0-9a-f]{64}$/i), origin: z.url(), host: z.string(), port: z.coerce.number().int().min(1024).max(65535) }).parse({
    databaseUrl: env.DATABASE_URL, appSecret: env.APP_SECRET, origin: env.WEB_ORIGIN || 'http://127.0.0.1:4311', host: env.API_HOST || '127.0.0.1', port: env.API_PORT || 4312,
  });
  return { ...parsed, production: env.NODE_ENV === 'production', mediaDir: resolve(env.MEDIA_DIR || '.local/media') };
}
