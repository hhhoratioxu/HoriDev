import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { app } from '../worker/index';
import { prepareRun, runTask } from '../worker/services/tasks';
import { reserve, settle, uncertain } from '../worker/services/budget';
import { demoAnalysis, demoGeneration, demoReview } from '../worker/services/demo';
import { defaultSettings } from '../shared/contracts';
import type { Env } from '../worker/types';
import type { Task, Project, TaskDetail } from '../shared/contracts';
import type { AiProvider } from '../worker/services/openai';

let mf: Miniflare;
let env: Env;
let ip = 0;
const origin = 'http://localhost:8787';
async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    origin?: string;
    customEnv?: Env;
  } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: options.origin ?? origin,
    'cf-connecting-ip': `192.0.2.${(++ip % 250) + 1}`,
  };
  if (options.cookie) headers.Cookie = options.cookie;
  return app.request(
    `${origin}/api${path}`,
    {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    },
    options.customEnv ?? env,
  );
}
async function signup(name = 'Alice') {
  const r = await request('/auth/sign-up/email', {
    method: 'POST',
    body: {
      name,
      email: `${crypto.randomUUID()}@example.com`,
      password: 'Safe-test-password-2026',
    },
  });
  const body = (await r.json()) as { user: { id: string } };
  expect(r.status, JSON.stringify(body)).toBe(200);
  const cookie = r.headers.get('set-cookie')!.split(';')[0];
  return { cookie, id: body.user.id };
}
async function createTask(cookie: string, customEnv = env) {
  const p = await request('/projects', {
    method: 'POST',
    cookie,
    body: { name: 'test project', service: 'python' },
    customEnv,
  });
  const project = (await p.json()) as Project;
  expect(p.status).toBe(201);
  const t = await request('/tasks', {
    method: 'POST',
    cookie,
    body: { projectId: project.id, prompt: '我需要一个工具把 Excel 按照日期分类。' },
    customEnv,
  });
  const task = (await t.json()) as Task;
  expect(t.status, JSON.stringify(task)).toBe(201);
  return { project, task };
}
beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("D1 fixture")}}',
    d1Databases: ['DB'],
    compatibilityDate: '2026-07-30',
  });
  env = {
    DB: (await mf.getD1Database('DB')) as unknown as D1Database,
    APP_URL: origin,
    APP_ENV: 'development',
    AI_MODE: 'demo',
    LIVE_CALLS_ENABLED: 'false',
    BETTER_AUTH_SECRET: 'test-secret-for-workers-32-characters-minimum',
    OPENAI_MODEL_ECONOMY: 'gpt-6-luna',
    OPENAI_MODEL_STANDARD: 'gpt-6.1-sol',
    ASSETS: { fetch: async () => new Response('') } as unknown as Fetcher,
  };
  for (const name of (await readdir(new URL('../migrations/', import.meta.url)))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    const migration = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
    for (const statement of migration
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean))
      await env.DB.prepare(statement).run();
  }
});
beforeEach(async () => {
  await env.DB.batch(
    [
      'usage_records',
      'generated_files',
      'task_events',
      'task_messages',
      'orders',
      'tasks',
      'projects',
      'sessions',
      'accounts',
      'user_quotas',
      'users',
      'verifications',
      'rate_limits',
      'admin_audit',
    ].map((name) => env.DB.prepare(`DELETE FROM ${name}`)),
  );
  await env.DB.prepare("UPDATE platform_settings SET value=? WHERE key='budget'")
    .bind(JSON.stringify(defaultSettings))
    .run();
  env.ADMIN_USER_IDS = '';
  ip = 0;
});
afterAll(async () => {
  await mf.dispose();
});

describe('real auth and private resource APIs with local D1', () => {
  it('registers, authenticates, and rejects unauthenticated reads', async () => {
    expect((await request('/projects')).status).toBe(401);
    const user = await signup();
    expect((await request('/me', { cookie: user.cookie })).status).toBe(200);
    expect(user.cookie).toContain('better-auth.session_token');
  });
  it('rejects CSRF and privilege escalation at sign-up', async () => {
    const user = await signup();
    expect(
      (
        await request('/projects', {
          method: 'POST',
          cookie: user.cookie,
          origin: 'https://evil.example',
          body: { name: 'x' },
        })
      ).status,
    ).toBe(403);
    const me = (await (await request('/me', { cookie: user.cookie })).json()) as {
      user: { role: string };
    };
    expect(me.user.role).toBe('user');
    expect((await request('/admin/overview', { cookie: user.cookie })).status).toBe(403);
  });
  it('isolates projects, tasks, files, ZIPs, and version writes between two accounts', async () => {
    const a = await signup(),
      b = await signup('Bob');
    const { project, task } = await createTask(a.cookie);
    for (const path of [
      `/projects/${project.id}`,
      `/projects/${project.id}/files`,
      `/projects/${project.id}/export`,
      `/projects/${project.id}/download?path=main.py`,
      `/tasks/${task.id}`,
    ])
      expect((await request(path, { cookie: b.cookie })).status, path).toBe(404);
    expect(
      (
        await request(`/projects/${project.id}/files`, {
          method: 'POST',
          cookie: b.cookie,
          body: { path: 'x.py', content: 'bad', baseVersion: 0 },
        })
      ).status,
    ).toBe(404);
  });
  it('persists version history, rejects stale edits and unsafe paths, exports ZIP bytes', async () => {
    const a = await signup();
    const { project } = await createTask(a.cookie);
    const path = `/projects/${project.id}/files`;
    expect(
      (
        await request(path, {
          method: 'POST',
          cookie: a.cookie,
          body: { path: 'main.py', content: 'print("你好")', language: 'python', baseVersion: 0 },
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(path, {
          method: 'POST',
          cookie: a.cookie,
          body: { path: 'main.py', content: 'stale', baseVersion: 0 },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(path, {
          method: 'POST',
          cookie: a.cookie,
          body: { path: '../secret.py', content: 'x', baseVersion: 0 },
        })
      ).status,
    ).toBe(400);
    const zip = await request(`/projects/${project.id}/export`, { cookie: a.cookie });
    expect(zip.status).toBe(200);
    expect(new Uint8Array(await zip.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([80, 75]));
  });
  it('runs complete demo flow over SSE without invented usage or executed tests', async () => {
    const a = await signup();
    const { task } = await createTask(a.cookie);
    for (const stage of ['analyze', 'generate', 'review']) {
      if (stage === 'generate')
        expect(
          (
            await request(`/tasks/${task.id}/confirm`, {
              method: 'POST',
              cookie: a.cookie,
              body: { scopeVersion: 1 },
            })
          ).status,
        ).toBe(200);
      const r = await request(`/tasks/${task.id}/run`, {
        method: 'POST',
        cookie: a.cookie,
        body: { stage },
      });
      expect(r.status).toBe(200);
      expect(await r.text()).toContain('event: complete');
    }
    const result = (await (
      await request(`/tasks/${task.id}`, { cookie: a.cookie })
    ).json()) as TaskDetail;
    expect(result.task.status).toBe('completed');
    expect(result.files).toHaveLength(3);
    expect(
      result.usage.every(
        (u) =>
          u.mode === 'demo' &&
          u.inputTokens === null &&
          u.outputTokens === null &&
          u.costMicros === 0,
      ),
    ).toBe(true);
    expect(result.execution.available).toBe(false);
  });
  it('requires explicit scope confirmation and prevents duplicate task claims', async () => {
    const a = await signup();
    const { task } = await createTask(a.cookie);
    expect(
      (
        await request(`/tasks/${task.id}/run`, {
          method: 'POST',
          cookie: a.cookie,
          body: { stage: 'generate' },
        })
      ).status,
    ).toBe(409);
    const result = await Promise.allSettled([
      prepareRun(env, a.id, task.id, 'analyze'),
      prepareRun(env, a.id, task.id, 'analyze'),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('cancels and never commits generated output after cancellation', async () => {
    const a = await signup();
    const { task } = await createTask(a.cookie);
    const h = await prepareRun(env, a.id, task.id, 'analyze');
    await request(`/tasks/${task.id}/cancel`, { method: 'POST', cookie: a.cookie, body: {} });
    await runTask(env, h, async () => {});
    const d = (await (
      await request(`/tasks/${task.id}`, { cookie: a.cookie })
    ).json()) as TaskDetail;
    expect(d.task.status).toBe('cancelled');
    expect(d.task.analysis).toBeNull();
    expect(d.files).toHaveLength(0);
  });
  it('uses allowlist plus password reauthentication for independent administrator access', async () => {
    const a = await signup();
    env.ADMIN_USER_IDS = a.id;
    expect((await request('/admin/overview', { cookie: a.cookie })).status).toBe(403);
    const bad = await request('/admin/unlock', {
      method: 'POST',
      cookie: a.cookie,
      body: { password: 'wrong' },
    });
    expect(bad.status).toBe(401);
    const unlock = await request('/admin/unlock', {
      method: 'POST',
      cookie: a.cookie,
      body: { password: 'Safe-test-password-2026' },
    });
    expect(unlock.status, await unlock.clone().text()).toBe(200);
    const cookie = `${a.cookie}; ${unlock.headers.get('set-cookie')!.split(';')[0]}`;
    const r = await request('/admin/overview', { cookie });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { userCount: { n: number } }).userCount.n).toBe(1);
  });
});
describe('paid resource and atomic budget controls with injected AI', () => {
  const liveEnv = () => ({
    ...env,
    AI_MODE: 'live',
    OPENAI_API_KEY: 'sk-test-never-sent',
    LIVE_CALLS_ENABLED: 'true',
  });
  it('blocks live analysis before manual approval and live calls when kill switch is off', async () => {
    const a = await signup();
    const live = liveEnv();
    const { task } = await createTask(a.cookie, live);
    await expect(prepareRun(live, a.id, task.id, 'analyze')).rejects.toMatchObject({
      code: 'ORDER_APPROVAL',
    });
    await env.DB.prepare("UPDATE orders SET approved_at=?,status='processing' WHERE task_id=?")
      .bind(Date.now(), task.id)
      .run();
    await expect(
      prepareRun({ ...live, LIVE_CALLS_ENABLED: 'false' }, a.id, task.id, 'analyze'),
    ).rejects.toMatchObject({ code: 'LIVE_DISABLED' });
  });
  it('allows only two concurrent platform reservations and keeps uncertain cost holds', async () => {
    const live = liveEnv();
    const users = await Promise.all([signup(), signup('Bob'), signup('Charlie')]);
    const jobs = [];
    for (const u of users) {
      const { task } = await createTask(u.cookie, live);
      const runId = crypto.randomUUID();
      await env.DB.prepare("UPDATE tasks SET run_id=?,status='analyzing' WHERE id=?")
        .bind(runId, task.id)
        .run();
      jobs.push({ u, task, runId });
    }
    const result = await Promise.allSettled(
      jobs.map((j) => reserve(live, j.task.id, j.u.id, j.runId, 'analyze', 'gpt-6-luna', 10000)),
    );
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const first = result.find((r) => r.status === 'fulfilled');
    if (first?.status === 'fulfilled') {
      await uncertain(live, first.value.id, false);
      const row = await env.DB.prepare(
        'SELECT status,reserved_micros FROM usage_records WHERE id=?',
      )
        .bind(first.value.id)
        .first();
      expect(row).toMatchObject({ status: 'uncertain', reserved_micros: 10000 });
    }
  });
  it('atomically rejects reservation beyond hard, user and task limits', async () => {
    const a = await signup();
    const live = liveEnv();
    const { task } = await createTask(a.cookie, live);
    await env.DB.prepare("UPDATE tasks SET run_id='r',status='analyzing' WHERE id=?")
      .bind(task.id)
      .run();
    await expect(
      reserve(live, task.id, a.id, 'r', 'analyze', 'gpt-6-luna', 800000),
    ).rejects.toMatchObject({ code: 'BUDGET_OR_CONCURRENCY' });
    await env.DB.prepare('INSERT INTO user_quotas VALUES (?,?)').bind(a.id, 100).run();
    await expect(
      reserve(live, task.id, a.id, 'r', 'analyze', 'gpt-6-luna', 200),
    ).rejects.toMatchObject({ code: 'BUDGET_OR_CONCURRENCY' });
    const tight = { ...defaultSettings, hardBudgetUsd: 0.0001, softBudgetUsd: 0 };
    await env.DB.prepare("UPDATE platform_settings SET value=? WHERE key='budget'")
      .bind(JSON.stringify(tight))
      .run();
    await expect(reserve(live, task.id, a.id, 'r', 'analyze', 'gpt-6-luna', 200)).rejects.toThrow();
  });
  it('settles official usage on malformed output without declaring success', async () => {
    const a = await signup();
    const live = liveEnv();
    const { task } = await createTask(a.cookie, live);
    await env.DB.prepare("UPDATE orders SET status='processing',approved_at=? WHERE task_id=?")
      .bind(Date.now(), task.id)
      .run();
    const h = await prepareRun(live, a.id, task.id, 'analyze');
    const provider: AiProvider = {
      run: async (_stage, _input, _model, _max, _signal, _delta, record) => {
        const usage = { input: 100, cached: 0, output: 10 };
        await record(usage, 'resp-fixture');
        return { value: { malformed: true }, usage, requestId: 'resp-fixture' };
      },
    };
    await runTask(live, h, async () => {}, provider);
    const d = (await (
      await request(`/tasks/${task.id}`, { cookie: a.cookie })
    ).json()) as TaskDetail;
    expect(d.task.status).toBe('failed');
    expect(d.usage[0]).toMatchObject({
      status: 'settled',
      inputTokens: 100,
      outputTokens: 10,
      reservedMicros: 0,
    });
    expect(d.usage[0].costMicros).toBeGreaterThan(0);
  });
  it('completes injected live analyze, generate and static review with real ledger transitions', async () => {
    const a = await signup();
    const live = liveEnv();
    const { task } = await createTask(a.cookie, live);
    await env.DB.prepare("UPDATE orders SET status='processing',approved_at=? WHERE task_id=?")
      .bind(Date.now(), task.id)
      .run();
    const provider: AiProvider = {
      run: async (stage, _input, _model, _max, _signal, delta, record) => {
        await delta('fixture');
        const usage = { input: 1000, cached: 100, output: 500 };
        await record(usage, 'resp-fixture');
        return {
          value:
            stage === 'analyze' ? demoAnalysis : stage === 'generate' ? demoGeneration : demoReview,
          usage,
          requestId: 'resp-fixture',
        };
      },
    };
    for (const stage of ['analyze', 'generate', 'review'] as const) {
      const h = await prepareRun(live, a.id, task.id, stage);
      await runTask(live, h, async () => {}, provider);
      if (stage === 'analyze')
        await request(`/tasks/${task.id}/confirm`, {
          method: 'POST',
          cookie: a.cookie,
          body: { scopeVersion: 1 },
        });
    }
    const d = (await (
      await request(`/tasks/${task.id}`, { cookie: a.cookie })
    ).json()) as TaskDetail;
    expect(d.task.status).toBe('completed');
    expect(d.usage).toHaveLength(3);
    expect(d.usage.every((u) => u.status === 'settled' && u.inputTokens === 1000)).toBe(true);
    expect(d.execution.available).toBe(false);
  });
});

describe('quote revisions and accounting races', () => {
  const liveEnv = () => ({
    ...env,
    AI_MODE: 'live',
    OPENAI_API_KEY: 'sk-test-never-sent',
    LIVE_CALLS_ENABLED: 'true',
  });
  it('revokes manual authorization in the same batch as a scope revision', async () => {
    const a = await signup();
    const live = liveEnv();
    const { task } = await createTask(a.cookie, live);
    await env.DB.prepare("UPDATE orders SET status='processing',approved_at=? WHERE task_id=?")
      .bind(Date.now(), task.id)
      .run();
    expect(
      (
        await request(`/tasks/${task.id}`, {
          method: 'PATCH',
          cookie: a.cookie,
          body: { prompt: '修改要求：请改成按年份分类 Excel，并增加命令行帮助。' },
          customEnv: live,
        })
      ).status,
    ).toBe(200);
    const order = await env.DB.prepare('SELECT approved_at,status FROM orders WHERE task_id=?')
      .bind(task.id)
      .first();
    expect(order).toMatchObject({ approved_at: null, status: 'awaiting_quote' });
    await expect(prepareRun(live, a.id, task.id, 'analyze')).rejects.toMatchObject({
      code: 'ORDER_APPROVAL',
    });
  });
  it('settles against the price captured at reservation time', async () => {
    const a = await signup();
    const live = liveEnv();
    const { task } = await createTask(a.cookie, live);
    await env.DB.prepare("UPDATE tasks SET run_id='price-run' WHERE id=?").bind(task.id).run();
    const ledger = await reserve(live, task.id, a.id, 'price-run', 'analyze', 'gpt-6-luna', 10000);
    const settings = {
      ...defaultSettings,
      modelPrices: { 'gpt-6-luna': { input: 100, cached: 10, output: 500 } },
    };
    await env.DB.prepare("UPDATE platform_settings SET value=? WHERE key='budget'")
      .bind(JSON.stringify(settings))
      .run();
    const cost = await settle(
      live,
      ledger.id,
      { input: 1000, cached: 0, output: 100 },
      'gpt-6-luna',
      'resp-price',
    );
    expect(cost).toBe(150);
  });
  it('checks the hard platform ceiling independently of the user and task ceilings', async () => {
    const a = await signup();
    const live = liveEnv();
    const { task } = await createTask(a.cookie, live);
    await env.DB.prepare("UPDATE tasks SET run_id='hard-run' WHERE id=?").bind(task.id).run();
    await env.DB.prepare("UPDATE platform_settings SET value=? WHERE key='budget'")
      .bind(JSON.stringify({ ...defaultSettings, softBudgetUsd: 0.005, hardBudgetUsd: 0.01 }))
      .run();
    await expect(
      reserve(live, task.id, a.id, 'hard-run', 'analyze', 'gpt-6-luna', 20000),
    ).rejects.toMatchObject({ code: 'BUDGET_OR_CONCURRENCY' });
  });
  it('bounds calls and prevents mode changes from upgrading a demo task', async () => {
    const a = await signup();
    const { task } = await createTask(a.cookie);
    await expect(prepareRun(liveEnv(), a.id, task.id, 'analyze')).rejects.toMatchObject({
      code: 'MODE_CHANGED',
    });
    await env.DB.prepare('UPDATE tasks SET calls=6 WHERE id=?').bind(task.id).run();
    await expect(prepareRun(env, a.id, task.id, 'analyze')).rejects.toMatchObject({
      code: 'CALL_LIMIT',
    });
  });
  it('accepts a manual order approval only once under concurrent requests', async () => {
    const a = await signup();
    env.ADMIN_USER_IDS = a.id;
    const live = liveEnv();
    const { task } = await createTask(a.cookie, live);
    const unlock = await request('/admin/unlock', {
      method: 'POST',
      cookie: a.cookie,
      body: { password: 'Safe-test-password-2026' },
      customEnv: live,
    });
    const cookie = `${a.cookie}; ${unlock.headers.get('set-cookie')!.split(';')[0]}`;
    const order = await env.DB.prepare('SELECT id FROM orders WHERE task_id=?')
      .bind(task.id)
      .first<{ id: string }>();
    const approvals = await Promise.all(
      [1, 2].map(() =>
        request(`/admin/orders/${order!.id}/approve`, {
          method: 'POST',
          cookie,
          body: { quoteCents: 100, acknowledge: true },
          customEnv: live,
        }),
      ),
    );
    expect(approvals.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});
