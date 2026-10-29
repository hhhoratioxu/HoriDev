import type { User } from '../shared/contracts';
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  FILES?: R2Bucket;
  APP_ENV?: string;
  APP_URL: string;
  AI_MODE?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL_ECONOMY?: string;
  OPENAI_MODEL_STANDARD?: string;
  LIVE_CALLS_ENABLED?: string;
  BETTER_AUTH_SECRET: string;
  ADMIN_USER_IDS?: string;
  ADMIN_ACCESS_SECRET?: string;
  ALLOW_REGISTRATION?: string;
  CONTACT_EMAIL?: string;
  OPENAI_TIMEOUT_MS?: string;
}
export type AppEnv = { Bindings: Env; Variables: { user: User; requestId: string } };
