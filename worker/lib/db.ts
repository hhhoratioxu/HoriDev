import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { defaultSettings, settingsSchema } from '../../shared/contracts';
import type { Env } from '../types';
export const db = (env: Env) => drizzle(env.DB, { schema });
export async function settings(env: Env) {
  const row = await db(env)
    .select()
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.key, 'budget'))
    .get();
  return row ? settingsSchema.parse(row.value) : defaultSettings;
}
export const mode = (env: Env): 'demo' | 'live' =>
  env.AI_MODE === 'live' && !!env.OPENAI_API_KEY ? 'live' : 'demo';
export const adminIds = (env: Env) =>
  (env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
export const isAdmin = (env: Env, id: string) => adminIds(env).includes(id);
