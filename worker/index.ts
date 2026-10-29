import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { auth, consumeLimit } from './lib/auth';
import { db, mode, settings, isAdmin } from './lib/db';
import { AppError, id, log } from './lib/errors';
import { exportZip, latestFiles, validateFiles, validatePath } from './lib/files';
import * as t from './db/schema';
import {
  ownProject,
  ownTask,
  detail,
  projectFiles,
  event,
  prepareRun,
  runTask,
} from './services/tasks';
import { settingsSchema, stages, type User } from '../shared/contracts';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();
app.use('/api/*', secureHeaders());
app.use(
  '/api/*',
  bodyLimit({
    maxSize: 650000,
    onError: () => {
      throw new AppError('BODY_SIZE', '请求内容超过 650 KB。', 413);
    },
  }),
);
app.use('/api/*', async (c, next) => {
  const requestId = id();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  c.header('Cache-Control', 'no-store');
  if (!c.env.BETTER_AUTH_SECRET || c.env.BETTER_AUTH_SECRET.length < 32)
    throw new AppError('AUTH_CONFIG', '会话密钥尚未配置，请运行本地初始化或设置生产 Secret。', 503);
  if (
    c.env.APP_ENV === 'production' &&
    (!c.env.APP_URL.startsWith('https://') || c.env.APP_URL.includes('YOUR-DOMAIN'))
  )
    throw new AppError('URL_CONFIG', '请先配置真实 HTTPS 域名。', 503);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    const allowed =
      c.env.APP_ENV === 'production'
        ? [c.env.APP_URL]
        : [
            c.env.APP_URL,
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:8787',
            'http://127.0.0.1:8787',
          ];
    if (!origin || !allowed.includes(origin))
      throw new AppError('CSRF', '请求来源未通过验证。', 403);
    if (!c.req.header('Content-Type')?.includes('application/json'))
      throw new AppError('CONTENT_TYPE', '请使用 application/json。', 415);
  }
  await next();
});
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth(c.env).handler(c.req.raw));
app.get('/api/health', (c) => c.json({ ok: true, service: 'HoriDev', execution: false }));
app.get('/api/config', async (c) =>
  c.json({
    mode: mode(c.env),
    liveReady: !!c.env.OPENAI_API_KEY,
    liveEnabled: c.env.LIVE_CALLS_ENABLED === 'true',
    registration: c.env.APP_ENV !== 'production' || c.env.ALLOW_REGISTRATION === 'true',
    storage: c.env.FILES ? 'R2 + D1' : 'D1 文本存储（本地开发可用）',
    execution: false,
    contact: c.env.CONTACT_EMAIL ?? null,
    plans: await db(c.env).select().from(t.pricingPlans).where(eq(t.pricingPlans.active, true)),
  }),
);
app.use('/api/*', async (c, next) => {
  const session = await auth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new AppError('UNAUTHORIZED', '请先登录。', 401);
  c.set('user', {
    ...session.user,
    role: isAdmin(c.env, session.user.id) ? 'admin' : 'user',
  } as User);
  const limit = await consumeLimit(c.env, `api:${session.user.id}`, 60000, 120);
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfter));
    throw new AppError('RATE_LIMIT', '请求过于频繁，请稍后重试。', 429);
  }
  await next();
});
app.get('/api/me', async (c) => {
  const user = c.get('user');
  const s = await settings(c.env);
  const usage = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(input_tokens),0) inputTokens,COALESCE(SUM(output_tokens),0) outputTokens,COALESCE(SUM(cost_micros),0) costMicros,COALESCE(SUM(reserved_micros),0) reservedMicros FROM usage_records WHERE user_id=? AND mode='live'",
  )
    .bind(user.id)
    .first();
  const quota = await db(c.env)
    .select()
    .from(t.userQuotas)
    .where(eq(t.userQuotas.userId, user.id))
    .get();
  return c.json({
    user,
    usage,
    limitMicros: quota?.limitMicros ?? Math.round(s.defaultUserLimitUsd * 1000000),
    maintenance: s.maintenance,
  });
});
app.patch('/api/me', async (c) => {
  const body = z.object({ name: z.string().trim().min(1).max(60) }).parse(await c.req.json());
  await db(c.env)
    .update(t.users)
    .set({ name: body.name, updatedAt: new Date() })
    .where(eq(t.users.id, c.get('user').id));
  return c.json({ ok: true });
});
app.get('/api/projects', async (c) =>
  c.json(
    await db(c.env)
      .select()
      .from(t.projects)
      .where(eq(t.projects.userId, c.get('user').id))
      .orderBy(desc(t.projects.updatedAt)),
  ),
);
app.post('/api/projects', async (c) => {
  const body = z
    .object({
      name: z.string().trim().min(1).max(80),
      description: z.string().max(3000).default(''),
      service: z.enum(['python', 'web', 'bug', 'api', 'data', 'refactor']).default('python'),
    })
    .parse(await c.req.json());
  const count = await c.env.DB.prepare('SELECT COUNT(*) n FROM projects WHERE user_id=?')
    .bind(c.get('user').id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= 50) throw new AppError('PROJECT_LIMIT', '每个账号最多 50 个项目。', 429);
  const project = {
    id: id(),
    userId: c.get('user').id,
    ...body,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db(c.env).insert(t.projects).values(project);
  return c.json(project, 201);
});
app.get('/api/projects/:id', async (c) =>
  c.json(await ownProject(c.env, c.get('user').id, c.req.param('id'))),
);
app.delete('/api/projects/:id', async (c) => {
  const project = await ownProject(c.env, c.get('user').id, c.req.param('id'));
  // Keep usage audit rows. Projects with live calls are archived by denying deletion until reconciliation/export.
  const live = await c.env.DB.prepare(
    "SELECT COUNT(*) n FROM usage_records u JOIN tasks k ON u.task_id=k.id WHERE k.project_id=? AND u.mode='live'",
  )
    .bind(project.id)
    .first<{ n: number }>();
  if (live?.n)
    throw new AppError(
      'AUDIT_RETENTION',
      '该项目包含真实计费记录，首版保留项目以便核账。可删除无计费项目。',
      409,
    );
  const busy = await c.env.DB.prepare(
    "SELECT COUNT(*) n FROM tasks WHERE project_id=? AND status IN ('analyzing','generating','reviewing')",
  )
    .bind(project.id)
    .first<{ n: number }>();
  if (busy?.n) throw new AppError('PROJECT_BUSY', '请先取消并等待运行中的任务结束。', 409);
  await c.env.DB.batch([
    c.env.DB.prepare(
      'DELETE FROM usage_records WHERE task_id IN (SELECT id FROM tasks WHERE project_id=?)',
    ).bind(project.id),
    c.env.DB.prepare('DELETE FROM projects WHERE id=? AND user_id=?').bind(
      project.id,
      c.get('user').id,
    ),
  ]);
  return c.json({ ok: true });
});
app.get('/api/projects/:id/files', async (c) => {
  await ownProject(c.env, c.get('user').id, c.req.param('id'));
  return c.json(await projectFiles(c.env, c.req.param('id')));
});
app.post('/api/projects/:id/files', async (c) => {
  const p = await ownProject(c.env, c.get('user').id, c.req.param('id'));
  const body = z
    .object({
      path: z.string().min(1).max(180),
      language: z.string().max(40).default('plaintext'),
      content: z.string().max(100000),
      baseVersion: z.number().int().nonnegative(),
    })
    .parse(await c.req.json());
  validateFiles([body]);
  const files = await projectFiles(c.env, p.id);
  const current = latestFiles(files).find((f) => f.path === body.path);
  const base = current?.version ?? 0;
  if (base !== body.baseVersion)
    throw new AppError('VERSION_CONFLICT', '文件已被修改，请刷新后合并。', 409);
  if (!current && latestFiles(files).length >= 20)
    throw new AppError('FILE_LIMIT', '项目最多 20 个当前文件。', 400);
  validateFiles([...latestFiles(files).filter((f) => f.path !== body.path), body]);
  const file = {
    id: id(),
    projectId: p.id,
    taskId: null,
    path: body.path,
    content: body.content,
    language: body.language,
    version: base + 1,
    createdAt: Date.now(),
  };
  const result = await c.env.DB.prepare(
    `INSERT INTO generated_files (id,project_id,task_id,path,content,language,version,created_at) SELECT ?,?,NULL,?,?,?,?,?
    WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE project_id=? AND status IN ('analyzing','generating','reviewing')) AND COALESCE((SELECT MAX(version) FROM generated_files WHERE project_id=? AND path=?),0)=? RETURNING id`,
  )
    .bind(
      file.id,
      p.id,
      file.path,
      file.content,
      file.language,
      file.version,
      file.createdAt,
      p.id,
      p.id,
      file.path,
      base,
    )
    .first();
  if (!result)
    throw new AppError('VERSION_CONFLICT', '文件版本冲突或 AI 正在处理此项目，请刷新后重试。', 409);
  return c.json(file, 201);
});
app.get('/api/projects/:id/export', async (c) => {
  await ownProject(c.env, c.get('user').id, c.req.param('id'));
  const files = latestFiles(await projectFiles(c.env, c.req.param('id')));
  if (!files.length) throw new AppError('NO_FILES', '项目还没有文件。', 404);
  const bytes = exportZip(files);
  if (c.env.FILES) {
    try {
      await c.env.FILES.put(`exports/${c.get('user').id}/${c.req.param('id')}/${id()}.zip`, bytes, {
        httpMetadata: { contentType: 'application/zip' },
      });
    } catch {
      log('r2_export_cache_failed', { projectId: c.req.param('id') });
    }
  }
  c.header('Content-Type', 'application/zip');
  c.header('Content-Disposition', 'attachment; filename="horidev-project.zip"');
  return c.body(bytes);
});
app.get('/api/projects/:id/download', async (c) => {
  await ownProject(c.env, c.get('user').id, c.req.param('id'));
  const path = validatePath(c.req.query('path') ?? '');
  const version = Number(c.req.query('version'));
  const files = await projectFiles(c.env, c.req.param('id'));
  const file =
    Number.isInteger(version) && version > 0
      ? files.find((f) => f.path === path && f.version === version)
      : latestFiles(files).find((f) => f.path === path);
  if (!file) throw new AppError('NOT_FOUND', '文件不存在。', 404);
  c.header('Content-Type', 'text/plain; charset=utf-8');
  c.header(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(file.path.split('/').pop()!)}`,
  );
  return c.body(file.content);
});
app.get('/api/tasks', async (c) => {
  const userId = c.get('user').id;
  const projectId = c.req.query('projectId');
  if (projectId) await ownProject(c.env, userId, projectId);
  return c.json(
    await db(c.env)
      .select()
      .from(t.tasks)
      .where(
        projectId
          ? and(eq(t.tasks.userId, userId), eq(t.tasks.projectId, projectId))
          : eq(t.tasks.userId, userId),
      )
      .orderBy(desc(t.tasks.createdAt))
      .limit(100),
  );
});
app.post('/api/tasks', async (c) => {
  const body = z
    .object({
      projectId: z.string().uuid(),
      prompt: z.string().trim().min(10).max(12000),
      title: z.string().trim().min(1).max(100).optional(),
    })
    .parse(await c.req.json());
  await ownProject(c.env, c.get('user').id, body.projectId);
  const count = await c.env.DB.prepare('SELECT COUNT(*) n FROM tasks WHERE user_id=?')
    .bind(c.get('user').id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= 200)
    throw new AppError('TASK_LIMIT', '首版每个账号最多 200 个任务。', 429);
  const task = {
    id: id(),
    projectId: body.projectId,
    userId: c.get('user').id,
    title: body.title ?? body.prompt.slice(0, 36),
    prompt: body.prompt,
    status: 'draft',
    mode: mode(c.env),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db(c.env).batch([
    db(c.env).insert(t.tasks).values(task),
    db(c.env).insert(t.taskMessages).values({
      id: id(),
      taskId: task.id,
      role: 'user',
      content: body.prompt,
      kind: 'requirement',
      createdAt: Date.now(),
    }),
    db(c.env)
      .insert(t.orders)
      .values({
        id: id(),
        taskId: task.id,
        userId: task.userId,
        status: task.mode === 'demo' ? 'draft' : 'awaiting_quote',
        kind: task.mode === 'demo' ? 'simulated' : 'manual',
        createdAt: Date.now(),
      }),
    db(c.env)
      .update(t.projects)
      .set({ updatedAt: Date.now() })
      .where(eq(t.projects.id, body.projectId)),
  ]);
  return c.json(task, 201);
});
app.get('/api/tasks/:id', async (c) =>
  c.json(await detail(c.env, c.get('user').id, c.req.param('id'))),
);
app.patch('/api/tasks/:id', async (c) => {
  const task = await ownTask(c.env, c.get('user').id, c.req.param('id'));
  const body = z.object({ prompt: z.string().trim().min(10).max(12000) }).parse(await c.req.json());
  if (['analyzing', 'generating', 'reviewing', 'completed', 'cancelled'].includes(task.status))
    throw new AppError('TASK_STATE', '当前状态不能修改范围。已完成任务请新建后续任务。', 409);
  const revisedAt = Date.now();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE tasks SET prompt=?,analysis=NULL,review=NULL,status='draft',error=NULL,version=version+1,updated_at=? WHERE id=? AND status=? AND version=? RETURNING id",
    ).bind(body.prompt, revisedAt, task.id, task.status, task.version),
    c.env.DB.prepare(
      "UPDATE orders SET approved_at=NULL,approved_by=NULL,status='awaiting_quote' WHERE task_id=? AND kind='manual' AND EXISTS (SELECT 1 FROM tasks WHERE id=? AND version=? AND updated_at=?)",
    ).bind(task.id, task.id, task.version + 1, revisedAt),
    c.env.DB.prepare(
      "INSERT INTO task_messages (id,task_id,role,content,kind,created_at) SELECT ?,?,'user',?,'revision',? WHERE EXISTS (SELECT 1 FROM tasks WHERE id=? AND version=? AND updated_at=?)",
    ).bind(id(), task.id, body.prompt, revisedAt, task.id, task.version + 1, revisedAt),
  ]);
  if (!result[0].meta.changes) throw new AppError('TASK_CONFLICT', '任务状态已更改。', 409);
  return c.json({ ok: true });
});
app.post('/api/tasks/:id/confirm', async (c) => {
  const task = await ownTask(c.env, c.get('user').id, c.req.param('id'));
  const body = z.object({ scopeVersion: z.number().int() }).parse(await c.req.json());
  if (
    task.status !== 'awaiting_confirmation' ||
    !task.analysis ||
    task.version !== body.scopeVersion
  )
    throw new AppError('SCOPE_CONFLICT', '任务范围已更改或尚未分析。', 409);
  const result = await c.env.DB.prepare(
    "UPDATE tasks SET status='ready',updated_at=? WHERE id=? AND status='awaiting_confirmation' AND version=? RETURNING id",
  )
    .bind(Date.now(), task.id, body.scopeVersion)
    .first();
  if (!result) throw new AppError('SCOPE_CONFLICT', '范围已确认或更改。', 409);
  if (task.mode === 'demo')
    await db(c.env)
      .update(t.orders)
      .set({ status: 'processing', approvedAt: Date.now(), kind: 'simulated' })
      .where(eq(t.orders.taskId, task.id));
  await event(c.env, task.id, '用户已确认任务范围。演示订单不代表真实付款。');
  return c.json({ ok: true });
});
app.post('/api/tasks/:id/cancel', async (c) => {
  const task = await ownTask(c.env, c.get('user').id, c.req.param('id'));
  if (['completed', 'cancelled'].includes(task.status))
    throw new AppError('TASK_STATE', '任务已结束。', 409);
  await c.env.DB.prepare(
    "UPDATE tasks SET cancel_requested=1,status='cancelled',updated_at=? WHERE id=? AND user_id=? AND status NOT IN ('completed','cancelled')",
  )
    .bind(Date.now(), task.id, c.get('user').id)
    .run();
  await db(c.env).update(t.orders).set({ status: 'cancelled' }).where(eq(t.orders.taskId, task.id));
  await event(
    c.env,
    task.id,
    '已请求取消。上游可能已消耗 Token，未知用量预留将保留以供核对。',
    'warning',
  );
  return c.json({ ok: true });
});
app.post('/api/tasks/:id/run', async (c) => {
  const body = z.object({ stage: z.enum(stages) }).parse(await c.req.json());
  const handle = await prepareRun(c.env, c.get('user').id, c.req.param('id'), body.stage);
  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    await runTask(
      c.env,
      handle,
      async (type, data) => {
        await stream.writeSSE({ event: type, data: JSON.stringify(data) });
      },
      undefined,
      abort.signal,
    );
  });
});
app.post('/api/tasks/:id/recover', async (c) => {
  const task = await ownTask(c.env, c.get('user').id, c.req.param('id'));
  if (
    !['analyzing', 'generating', 'reviewing'].includes(task.status) ||
    Date.now() - task.updatedAt < 240000
  )
    throw new AppError('NOT_STALE', '任务仍在运行或不需要恢复。', 409);
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE usage_records SET status='uncertain' WHERE task_id=? AND status='reserved'",
    ).bind(task.id),
    c.env.DB.prepare(
      "UPDATE tasks SET status='failed',run_id=NULL,error='运行中断，未知费用保留待核对。',updated_at=? WHERE id=? AND run_id=?",
    ).bind(Date.now(), task.id, task.runId),
  ]);
  return c.json({ ok: true });
});

app.use('/api/admin/*', async (c, next) => {
  if (!isAdmin(c.env, c.get('user').id))
    throw new AppError('FORBIDDEN', '此接口仅限管理员访问。', 403);
  await next();
});
app.post('/api/admin/unlock', async (c) => {
  const body = z.object({ password: z.string().min(1).max(128) }).parse(await c.req.json());
  const limit = await consumeLimit(c.env, `admin:${c.get('user').id}`, 60000, 5);
  if (!limit.allowed) throw new AppError('RATE_LIMIT', '验证过于频繁。', 429);
  try {
    await auth(c.env).api.verifyPassword({
      headers: c.req.raw.headers,
      body: { password: body.password },
    });
  } catch {
    throw new AppError('ADMIN_PASSWORD', '密码验证失败。', 401);
  }
  const session = await auth(c.env).api.getSession({ headers: c.req.raw.headers });
  await setSignedCookie(
    c,
    'hori-admin',
    `${c.get('user').id}|${session!.session.id}|${Date.now() + 900000}`,
    c.env.BETTER_AUTH_SECRET,
    {
      httpOnly: true,
      secure: c.env.APP_ENV === 'production',
      sameSite: 'Strict',
      path: '/api/admin',
      maxAge: 900,
    },
  );
  return c.json({ ok: true });
});
app.use('/api/admin/*', async (c, next) => {
  const value = await getSignedCookie(c, c.env.BETTER_AUTH_SECRET, 'hori-admin');
  const session = await auth(c.env).api.getSession({ headers: c.req.raw.headers });
  const parts = value ? value.split('|') : [];
  if (
    parts[0] !== c.get('user').id ||
    parts[1] !== session?.session.id ||
    Number(parts[2]) < Date.now()
  )
    throw new AppError('ADMIN_REAUTH', '请重新验证密码以进入管理后台。', 403);
  await next();
});
app.post('/api/admin/lock', (c) => {
  deleteCookie(c, 'hori-admin', { path: '/api/admin' });
  return c.json({ ok: true });
});
app.get('/api/admin/overview', async (c) => {
  const [
    s,
    userCount,
    active,
    counts,
    usage,
    daily,
    users,
    exceptions,
    unsettled,
    orderList,
    plans,
    audit,
  ] = await Promise.all([
    settings(c.env),
    c.env.DB.prepare('SELECT COUNT(*) n FROM users').first(),
    c.env.DB.prepare('SELECT COUNT(DISTINCT user_id) n FROM sessions WHERE updated_at>?')
      .bind(Date.now() - 7 * 86400000)
      .first(),
    c.env.DB.prepare('SELECT status,COUNT(*) n FROM tasks GROUP BY status').all(),
    c.env.DB.prepare(
      "SELECT COUNT(*) calls,COALESCE(SUM(input_tokens),0) inputTokens,COALESCE(SUM(output_tokens),0) outputTokens,COALESCE(SUM(cost_micros),0) costMicros,COALESCE(SUM(reserved_micros),0) reservedMicros FROM usage_records WHERE mode='live'",
    ).first(),
    c.env.DB.prepare(
      "SELECT date(created_at/1000,'unixepoch') day,SUM(cost_micros) costMicros,SUM(reserved_micros) reservedMicros FROM usage_records WHERE mode='live' AND created_at>? GROUP BY day ORDER BY day",
    )
      .bind(Date.now() - 30 * 86400000)
      .all(),
    c.env.DB.prepare(
      "SELECT u.id,u.name,u.email,u.created_at createdAt,q.limit_micros limitMicros,COALESCE((SELECT SUM(cost_micros+reserved_micros) FROM usage_records r WHERE r.user_id=u.id AND r.mode='live'),0) usedMicros FROM users u LEFT JOIN user_quotas q ON q.user_id=u.id ORDER BY u.created_at DESC LIMIT 200",
    ).all(),
    c.env.DB.prepare(
      "SELECT id,title,error,status,updated_at updatedAt FROM tasks WHERE status='failed' ORDER BY updated_at DESC LIMIT 30",
    ).all(),
    c.env.DB.prepare(
      "SELECT id,user_id userId,task_id taskId,reserved_micros reservedMicros,status FROM usage_records WHERE status='uncertain' ORDER BY created_at DESC LIMIT 50",
    ).all(),
    db(c.env).select().from(t.orders).orderBy(desc(t.orders.createdAt)).limit(50),
    db(c.env).select().from(t.pricingPlans),
    db(c.env).select().from(t.adminAudit).orderBy(desc(t.adminAudit.createdAt)).limit(30),
  ]);
  return c.json({
    settings: s,
    userCount,
    active,
    counts: counts.results,
    usage,
    daily: daily.results,
    users: users.results,
    exceptions: exceptions.results,
    unsettled: unsettled.results,
    orders: orderList,
    plans,
    audit,
  });
});
async function audit(c: import('hono').Context<AppEnv>, action: string, target: string) {
  await db(c.env)
    .insert(t.adminAudit)
    .values({ id: id(), userId: c.get('user').id, action, target, createdAt: Date.now() });
}
app.put('/api/admin/settings', async (c) => {
  const value = settingsSchema.parse(await c.req.json());
  await db(c.env)
    .insert(t.platformSettings)
    .values({ key: 'budget', value, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: t.platformSettings.key, set: { value, updatedAt: Date.now() } });
  await audit(c, 'settings.update', 'budget');
  return c.json({ ok: true });
});
app.put('/api/admin/quotas/:userId', async (c) => {
  const body = z.object({ limitUsd: z.number().min(0).max(1000) }).parse(await c.req.json());
  const userId = c.req.param('userId');
  if (
    !(await db(c.env).select({ id: t.users.id }).from(t.users).where(eq(t.users.id, userId)).get())
  )
    throw new AppError('NOT_FOUND', '用户不存在。', 404);
  const limitMicros = Math.round(body.limitUsd * 1000000);
  await db(c.env)
    .insert(t.userQuotas)
    .values({ userId, limitMicros })
    .onConflictDoUpdate({ target: t.userQuotas.userId, set: { limitMicros } });
  await audit(c, 'quota.update', userId);
  return c.json({ ok: true });
});
app.put('/api/admin/plans/:id', async (c) => {
  const body = z
    .object({
      name: z.string().min(1).max(40),
      description: z.string().max(200),
      priceLabel: z.string().max(80),
      features: z.array(z.string().max(100)).max(12),
      taskLimit: z.number().int().min(0).max(10000),
      active: z.boolean(),
      highlighted: z.boolean(),
    })
    .parse(await c.req.json());
  await db(c.env)
    .update(t.pricingPlans)
    .set(body)
    .where(eq(t.pricingPlans.id, c.req.param('id')));
  await audit(c, 'plan.update', c.req.param('id'));
  return c.json({ ok: true });
});
app.post('/api/admin/orders/:id/approve', async (c) => {
  const body = z
    .object({ quoteCents: z.number().int().min(0).max(10000000), acknowledge: z.literal(true) })
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "UPDATE orders SET status='processing',kind='manual',quote_cents=?,approved_at=?,approved_by=? WHERE id=? AND status IN ('awaiting_quote','draft','awaiting_payment') RETURNING id",
  )
    .bind(body.quoteCents, Date.now(), c.get('user').id, c.req.param('id'))
    .first();
  if (!row) throw new AppError('ORDER_CONFLICT', '订单已处理或不能确认。', 409);
  await audit(c, 'order.manual_approve', c.req.param('id'));
  return c.json({ ok: true, note: '人工确认资源授权，未通过支付网关收款。' });
});
app.post('/api/admin/usage/:id/reconcile', async (c) => {
  const body = z
    .object({
      costMicros: z.number().int().min(0).max(100000000),
      note: z.string().min(10).max(500),
    })
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "UPDATE usage_records SET cost_micros=?,reserved_micros=0,status='manual',settled_at=? WHERE id=? AND status='uncertain' RETURNING id",
  )
    .bind(body.costMicros, Date.now(), c.req.param('id'))
    .first();
  if (!row) throw new AppError('USAGE_CONFLICT', '只能核对待确认用量。', 409);
  await audit(c, 'usage.reconcile:' + body.note, c.req.param('id'));
  return c.json({ ok: true });
});
app.notFound((c) =>
  c.json(
    { error: { code: 'NOT_FOUND', message: '接口不存在。', requestId: c.get('requestId') } },
    404,
  ),
);
app.onError((error, c) => {
  const e =
    error instanceof AppError
      ? error
      : error instanceof z.ZodError
        ? new AppError('VALIDATION', error.issues.map((i) => i.message).join('；'), 422)
        : error instanceof SyntaxError
          ? new AppError('INVALID_JSON', '请求内容不是有效 JSON。', 400)
          : new AppError('INTERNAL', '服务暂时出错，请稍后重试。', 500);
  log('request_error', { requestId: c.get('requestId') ?? null, code: e.code, status: e.status });
  return c.json(
    { error: { code: e.code, message: e.message, requestId: c.get('requestId') } },
    e.status as 400,
  );
});
export { app };
export default app;
