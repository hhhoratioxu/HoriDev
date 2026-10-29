import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { db } from './db';
import * as tables from '../db/schema';
import type { Env } from '../types';

export async function consumeLimit(env: Env, key: string, windowMs: number, max: number) {
  const now = Date.now();
  const row = await env.DB.prepare(
    'INSERT INTO rate_limits (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END RETURNING count,reset_at',
  )
    .bind(key, now + windowMs, now, now, now + windowMs)
    .first<{ count: number; reset_at: number }>();
  return {
    allowed: !!row && row.count <= max,
    retryAfter: row ? Math.ceil((row.reset_at - now) / 1000) : 60,
  };
}
export function auth(env: Env) {
  return betterAuth({
    appName: 'HoriDev',
    baseURL: env.APP_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins:
      env.APP_ENV === 'production'
        ? [env.APP_URL]
        : [
            env.APP_URL,
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:8787',
            'http://127.0.0.1:8787',
          ],
    database: drizzleAdapter(db(env), {
      provider: 'sqlite',
      schema: {
        user: tables.users,
        session: tables.sessions,
        account: tables.accounts,
        verification: tables.verifications,
      },
      transaction: false,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      disableSignUp: env.APP_ENV === 'production' && env.ALLOW_REGISTRATION !== 'true',
    },
    user: { additionalFields: { role: { type: 'string', defaultValue: 'user', input: false } } },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: env.APP_ENV === 'production',
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.APP_ENV === 'production',
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 50,
      customRules: {
        '/sign-in/email': { window: 60, max: 8 },
        '/sign-up/email': { window: 60, max: 5 },
      },
      customStorage: {
        consume: async (key, rule) => {
          const result = await consumeLimit(env, `auth:${key}`, rule.window * 1000, rule.max);
          return { allowed: result.allowed, retryAfter: result.allowed ? null : result.retryAfter };
        },
      },
    },
    logger: { level: 'error' },
  });
}
