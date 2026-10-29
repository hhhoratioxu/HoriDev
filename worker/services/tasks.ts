import { and, eq, asc, desc } from 'drizzle-orm';
import type { Env } from '../types';
import { db, mode, settings } from '../lib/db';
import { AppError, id, log } from '../lib/errors';
import { latestFiles, validateFiles } from '../lib/files';
import {
  tasks,
  projects,
  generatedFiles,
  taskMessages,
  taskEvents,
  usageRecords,
  orders,
} from '../db/schema';
import {
  analysisSchema,
  generationSchema,
  reviewSchema,
  type Stage,
  type GeneratedFile,
} from '../../shared/contracts';
import { reserve, settle, uncertain, reservationMicros } from './budget';
import { openAIProvider, aiError, definitelyRejected, maxOutput, type AiProvider } from './openai';
import { demoResult } from './demo';

export async function ownProject(env: Env, userId: string, projectId: string) {
  const p = await db(env)
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();
  if (!p) throw new AppError('NOT_FOUND', '项目不存在。', 404);
  return p;
}
export async function ownTask(env: Env, userId: string, taskId: string) {
  const t = await db(env)
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .get();
  if (!t) throw new AppError('NOT_FOUND', '任务不存在。', 404);
  return t;
}
export async function projectFiles(env: Env, projectId: string) {
  return (await db(env)
    .select()
    .from(generatedFiles)
    .where(eq(generatedFiles.projectId, projectId))
    .orderBy(asc(generatedFiles.path), desc(generatedFiles.version))) as GeneratedFile[];
}
export async function event(env: Env, taskId: string, message: string, level = 'info') {
  await db(env)
    .insert(taskEvents)
    .values({ id: id(), taskId, level, message, createdAt: Date.now() });
}
export async function detail(env: Env, userId: string, taskId: string) {
  const task = await ownTask(env, userId, taskId);
  const [files, messages, events, usage, order] = await Promise.all([
    projectFiles(env, task.projectId),
    db(env)
      .select()
      .from(taskMessages)
      .where(eq(taskMessages.taskId, taskId))
      .orderBy(asc(taskMessages.createdAt)),
    db(env)
      .select()
      .from(taskEvents)
      .where(eq(taskEvents.taskId, taskId))
      .orderBy(asc(taskEvents.createdAt)),
    db(env)
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.taskId, taskId))
      .orderBy(asc(usageRecords.createdAt)),
    db(env).select().from(orders).where(eq(orders.taskId, taskId)).get(),
  ]);
  return {
    task,
    files,
    messages,
    events,
    usage,
    order: order ?? null,
    execution: { available: false, label: '运行与自动化测试未启用 · AI 静态审查仅供参考' },
  };
}
export interface RunHandle {
  taskId: string;
  runId: string;
  userId: string;
  stage: Stage;
  oldStatus: string;
  usageId: string | null;
  model: string;
  input: string;
  mode: 'demo' | 'live';
}
export async function prepareRun(
  env: Env,
  userId: string,
  taskId: string,
  stage: Stage,
): Promise<RunHandle> {
  const task = await ownTask(env, userId, taskId);
  const s = await settings(env);
  if (s.maintenance || !s.aiEnabled)
    throw new AppError('PLATFORM_PAUSED', '平台暂时停止创建任务。', 503);
  const allowed =
    stage === 'analyze'
      ? ['draft', 'failed']
      : stage === 'generate'
        ? ['ready', 'failed']
        : ['ready', 'failed', 'completed'];
  if (!allowed.includes(task.status) || (stage !== 'analyze' && !task.analysis))
    throw new AppError('TASK_STATE', '当前任务状态不支持此操作。', 409);
  const files = latestFiles(await projectFiles(env, task.projectId));
  if (stage === 'review' && !files.length) throw new AppError('NO_FILES', '需要先生成代码。', 409);
  if (task.calls >= s.maxTaskCalls)
    throw new AppError('CALL_LIMIT', '此任务已达到调用次数上限。请创建新任务。', 429);
  if (task.mode !== mode(env))
    throw new AppError(
      'MODE_CHANGED',
      '平台运行模式已更改，请创建新任务以保证演示与真实结果独立。',
      409,
    );
  const order = await db(env).select().from(orders).where(eq(orders.taskId, taskId)).get();
  if (task.mode === 'live' && (!env.OPENAI_API_KEY || env.LIVE_CALLS_ENABLED !== 'true'))
    throw new AppError('LIVE_DISABLED', '真实模型调用尚未由运营方启用。', 503);
  if (
    task.mode === 'live' &&
    (!order?.approvedAt ||
      order.kind !== 'manual' ||
      !['processing', 'completed'].includes(order.status))
  )
    throw new AppError(
      'ORDER_APPROVAL',
      '该订单需要管理员确认报价与资源授权后才可使用付费模型。',
      402,
    );
  const messages = await db(env)
    .select()
    .from(taskMessages)
    .where(eq(taskMessages.taskId, taskId))
    .orderBy(desc(taskMessages.createdAt))
    .limit(12);
  const input = JSON.stringify({
    requirement: task.prompt,
    scope: task.analysis,
    messages: messages.reverse().map((m) => ({ role: m.role, content: m.content.slice(0, 3000) })),
    files: files.map((f) => ({ path: f.path, content: f.content })),
  });
  if (new TextEncoder().encode(input).length > 60000)
    throw new AppError('CONTEXT_SIZE', '任务上下文超过 60 KB，请缩小项目或拆分任务。', 413);
  const model =
    stage === 'generate' &&
    (task.analysis as { complexity?: string } | null)?.complexity === 'complex'
      ? env.OPENAI_MODEL_STANDARD
      : env.OPENAI_MODEL_ECONOMY;
  if (task.mode === 'live' && (!model || !s.modelPrices[model]))
    throw new AppError('MODEL_CONFIG', '模型名称或其价格尚未配置。', 503);
  const runId = id();
  const target =
    stage === 'analyze' ? 'analyzing' : stage === 'generate' ? 'generating' : 'reviewing';
  const lock = await env.DB.prepare(
    "UPDATE tasks SET status=?,run_id=?,cancel_requested=0,error=NULL,calls=calls+1,updated_at=? WHERE id=? AND user_id=? AND status=? AND calls=? AND NOT EXISTS (SELECT 1 FROM tasks other WHERE other.project_id=tasks.project_id AND other.id<>tasks.id AND other.status IN ('analyzing','generating','reviewing')) RETURNING id",
  )
    .bind(target, runId, Date.now(), taskId, userId, task.status, task.calls)
    .first();
  if (!lock) throw new AppError('TASK_CONFLICT', '任务已被另一请求更新。请刷新。', 409);
  let usageId: string | null;
  try {
    if (task.mode === 'live')
      usageId = (
        await reserve(
          env,
          taskId,
          userId,
          runId,
          stage,
          model!,
          reservationMicros(
            new TextEncoder().encode(input).length,
            maxOutput[stage],
            s.modelPrices[model!],
          ),
        )
      ).id;
    else {
      usageId = id();
      await db(env).insert(usageRecords).values({
        id: usageId,
        userId,
        taskId,
        stage,
        model: 'demo-fixture',
        mode: 'demo',
        status: 'demo',
        costMicros: 0,
        reservedMicros: 0,
        createdAt: Date.now(),
      });
    }
  } catch (error) {
    await env.DB.prepare(
      'UPDATE tasks SET status=?,run_id=NULL,calls=calls-1 WHERE id=? AND run_id=?',
    )
      .bind(task.status, taskId, runId)
      .run();
    throw error;
  }
  return {
    taskId,
    runId,
    userId,
    stage,
    oldStatus: task.status,
    usageId,
    model: model ?? 'demo-fixture',
    input,
    mode: task.mode as 'demo' | 'live',
  };
}

export async function runTask(
  env: Env,
  handle: RunHandle,
  send: (type: string, data: unknown) => Promise<void>,
  provider?: AiProvider,
  clientSignal?: AbortSignal,
) {
  const { taskId, runId, stage, usageId } = handle;
  const abort = new AbortController();
  let usageSettled = false;
  let polling = false;
  const timeout = setTimeout(
    () => abort.abort(),
    Math.min(Number(env.OPENAI_TIMEOUT_MS) || 120000, 180000),
  );
  const onAbort = () => abort.abort();
  clientSignal?.addEventListener('abort', onAbort, { once: true });
  if (clientSignal?.aborted) abort.abort();
  const poll = setInterval(() => {
    if (polling) return;
    polling = true;
    void env.DB.prepare('SELECT cancel_requested,run_id FROM tasks WHERE id=?')
      .bind(taskId)
      .first<{ cancel_requested: number; run_id: string }>()
      .then((t) => {
        if (!t || t.cancel_requested || t.run_id !== runId) abort.abort();
      })
      .catch(() => abort.abort())
      .finally(() => {
        polling = false;
      });
  }, 700);
  try {
    await event(
      env,
      taskId,
      handle.mode === 'demo'
        ? '演示模式：载入预置示例，无 OpenAI 调用或 Token 消耗。'
        : `开始${stage === 'analyze' ? '需求分析' : stage === 'generate' ? '代码生成' : 'AI 静态审查'} · 模型 ${handle.model}`,
    );
    await send('status', { stage, mode: handle.mode });
    let value: unknown;
    if (handle.mode === 'demo') {
      value = demoResult(stage);
      const text = JSON.stringify(value);
      for (let i = 0; i < text.length; i += 160) {
        if (abort.signal.aborted) throw new AppError('CANCELLED', '任务已取消。', 409);
        await send('delta', { text: text.slice(i, i + 160) });
        await new Promise<void>((r) => setTimeout(r, 12));
      }
    } else {
      const result = await (provider ?? openAIProvider(env)).run(
        stage,
        handle.input,
        handle.model,
        maxOutput[stage],
        abort.signal,
        async (text) => send('delta', { text }),
        async (usage, requestId) => {
          await settle(env, usageId!, usage, handle.model, requestId);
          usageSettled = true;
        },
      );
      value = result.value;
      if (!usageSettled) {
        await settle(env, usageId!, result.usage, handle.model, result.requestId);
        usageSettled = true;
      }
    }
    if (abort.signal.aborted) throw new AppError('CANCELLED', '任务已取消或超时。', 409);
    const task = await ownTask(env, handle.userId, taskId);
    if (task.cancelRequested || task.runId !== runId)
      throw new AppError('CANCELLED', '任务已取消。', 409);
    const statements: D1PreparedStatement[] = [];
    const now = Date.now();
    let nextStatus = 'ready';
    let content = '';
    if (stage === 'analyze') {
      const analysis = analysisSchema.parse(value);
      nextStatus = 'awaiting_confirmation';
      content = analysis.understanding;
      statements.push(
        env.DB.prepare(
          'UPDATE tasks SET analysis=? WHERE id=? AND run_id=? AND cancel_requested=0',
        ).bind(JSON.stringify(analysis), taskId, runId),
      );
    } else if (stage === 'generate') {
      const output = generationSchema.parse(value);
      validateFiles(output.files);
      if (!output.files.some((f) => f.path.toLowerCase() === 'readme.md'))
        output.files.push({
          path: 'README.md',
          language: 'markdown',
          content: `# HoriDev 交付\n\n${output.summary}\n\n## 使用说明\n\n${output.instructions}\n\n> AI 生成结果。运行和自动化测试未启用，请自行审查与验证。\n`,
        });
      validateFiles(output.files);
      content = output.summary + '\n\n' + output.instructions;
      const existing = await projectFiles(env, task.projectId);
      const changed = new Set(output.files.map((f) => f.path));
      validateFiles([
        ...latestFiles(existing).filter((f) => !changed.has(f.path)),
        ...output.files,
      ]);
      for (const file of output.files) {
        const version =
          1 + Math.max(0, ...existing.filter((f) => f.path === file.path).map((f) => f.version));
        statements.push(
          env.DB.prepare(
            'INSERT INTO generated_files (id,project_id,task_id,path,language,content,version,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM tasks WHERE id=? AND run_id=? AND cancel_requested=0)',
          ).bind(
            id(),
            task.projectId,
            taskId,
            file.path,
            file.language,
            file.content,
            version,
            now,
            taskId,
            runId,
          ),
        );
      }
    } else {
      const review = reviewSchema.parse(value);
      nextStatus = 'completed';
      content = review.summary;
      statements.push(
        env.DB.prepare(
          'UPDATE tasks SET review=? WHERE id=? AND run_id=? AND cancel_requested=0',
        ).bind(JSON.stringify(review), taskId, runId),
      );
      statements.push(
        env.DB.prepare(
          "UPDATE orders SET status='completed' WHERE task_id=? AND EXISTS (SELECT 1 FROM tasks WHERE id=? AND run_id=? AND cancel_requested=0)",
        ).bind(taskId, taskId, runId),
      );
    }
    statements.push(
      env.DB.prepare(
        'INSERT INTO task_messages (id,task_id,role,content,kind,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM tasks WHERE id=? AND run_id=? AND cancel_requested=0)',
      ).bind(
        id(),
        taskId,
        'assistant',
        content,
        handle.mode === 'demo' ? 'demo' : stage,
        now,
        taskId,
        runId,
      ),
    );
    statements.push(
      env.DB.prepare(
        'UPDATE tasks SET status=?,run_id=NULL,error=NULL,updated_at=? WHERE id=? AND run_id=? AND cancel_requested=0',
      ).bind(nextStatus, now, taskId, runId),
    );
    const results = await env.DB.batch(statements);
    if (!results.at(-1)?.meta.changes)
      throw new AppError('CANCELLED', '任务已取消，结果未提交。', 409);
    await event(
      env,
      taskId,
      stage === 'review'
        ? 'AI 静态审查已完成。运行与自动化测试未启用。'
        : stage === 'generate'
          ? '源码已保存。下一步可发起 AI 静态审查或直接导出。'
          : '需求分析已保存，请确认任务范围。',
    );
    await send('complete', { stage, status: nextStatus });
  } catch (error) {
    const e = aiError(error);
    if (handle.mode === 'live' && usageId && !usageSettled)
      await uncertain(env, usageId, definitelyRejected(error));
    const current = await env.DB.prepare('SELECT cancel_requested FROM tasks WHERE id=?')
      .bind(taskId)
      .first<{ cancel_requested: number }>();
    const cancelled = !!current?.cancel_requested;
    await env.DB.prepare(
      'UPDATE tasks SET status=?,error=?,run_id=NULL,updated_at=? WHERE id=? AND run_id=?',
    )
      .bind(cancelled ? 'cancelled' : 'failed', e.message, Date.now(), taskId, runId)
      .run();
    await event(env, taskId, e.message, 'error');
    log('task_failed', { taskId, code: e.code });
    await send('error', { code: e.code, message: e.message });
  } finally {
    abort.abort();
    clearTimeout(timeout);
    clearInterval(poll);
    clientSignal?.removeEventListener('abort', onAbort);
  }
}
