import type { Env } from '../types';
import type { PlatformSettings, Stage } from '../../shared/contracts';
import { AppError, id } from '../lib/errors';
import { settings } from '../lib/db';

export const micros = (usd: number) => Math.round(usd * 1_000_000);
export function costMicros(
  input: number,
  cached: number,
  output: number,
  price: PlatformSettings['modelPrices'][string],
) {
  return Math.ceil(
    Math.max(0, input - cached) * price.input + cached * price.cached + output * price.output,
  );
}
export function reservationMicros(
  inputBytes: number,
  maxOutput: number,
  price: PlatformSettings['modelPrices'][string],
) {
  // One token per UTF-8 byte is deliberately conservative. Include schema/envelope and price headroom.
  return Math.ceil(((inputBytes + 8192) * price.input * 1.25 + maxOutput * price.output) * 1.25);
}
export async function reserve(
  env: Env,
  taskId: string,
  userId: string,
  runId: string,
  stage: Stage,
  model: string,
  amount: number,
) {
  const s = await settings(env);
  const usageId = id();
  const now = Date.now();
  if (!s.aiEnabled || s.maintenance)
    throw new AppError('PLATFORM_PAUSED', '平台暂时停止模型调用。', 503);
  const result = await env.DB.prepare(
    `INSERT INTO usage_records (id,user_id,task_id,stage,model,mode,status,cost_micros,reserved_micros,created_at,price_snapshot)
    SELECT ?,?,?,?,?, 'live','reserved',0,?,?,?
    WHERE (SELECT COALESCE(SUM(cost_micros+reserved_micros),0) FROM usage_records WHERE mode='live')+? <= ?
    AND (SELECT COALESCE(SUM(cost_micros+reserved_micros),0) FROM usage_records WHERE user_id=? AND mode='live')+? <= COALESCE((SELECT limit_micros FROM user_quotas WHERE user_id=?),?)
    AND (SELECT COALESCE(SUM(cost_micros+reserved_micros),0) FROM usage_records WHERE task_id=? AND mode='live')+? <= ?
    AND (SELECT COUNT(*) FROM usage_records WHERE status='reserved' AND mode='live') < ?
    AND (SELECT COUNT(*) FROM usage_records WHERE status='reserved' AND mode='live' AND user_id=?) = 0
    AND EXISTS (SELECT 1 FROM tasks WHERE id=? AND run_id=? AND cancel_requested=0 AND calls<=?)
    RETURNING id`,
  )
    .bind(
      usageId,
      userId,
      taskId,
      stage,
      model,
      amount,
      now,
      JSON.stringify(s.modelPrices[model]),
      amount,
      micros(s.hardBudgetUsd),
      userId,
      amount,
      userId,
      micros(s.defaultUserLimitUsd),
      taskId,
      amount,
      micros(s.taskLimitUsd),
      s.maxConcurrent,
      userId,
      taskId,
      runId,
      s.maxTaskCalls,
    )
    .first<{ id: string }>();
  if (!result)
    throw new AppError(
      'BUDGET_OR_CONCURRENCY',
      '本次预留超过平台、用户或任务预算，或已有任务正在运行。请等待或联系管理员。',
      429,
    );
  return { id: usageId, settings: s };
}
export async function settle(
  env: Env,
  usageId: string,
  usage: { input: number; cached: number; output: number },
  model: string,
  requestId: string | null,
) {
  const record = await env.DB.prepare(
    'SELECT price_snapshot FROM usage_records WHERE id=? AND model=?',
  )
    .bind(usageId, model)
    .first<{ price_snapshot: string | null }>();
  const price = record?.price_snapshot
    ? (JSON.parse(record.price_snapshot) as PlatformSettings['modelPrices'][string])
    : undefined;
  if (!price) throw new AppError('PRICE_MISSING', '模型价格尚未配置，无法结算。', 503);
  const cost = costMicros(usage.input, usage.cached, usage.output, price);
  await env.DB.prepare(
    "UPDATE usage_records SET input_tokens=?,cached_tokens=?,output_tokens=?,cost_micros=?,reserved_micros=0,status='settled',request_id=?,settled_at=? WHERE id=? AND status IN ('reserved','uncertain')",
  )
    .bind(usage.input, usage.cached, usage.output, cost, requestId, Date.now(), usageId)
    .run();
  return cost;
}
export async function uncertain(env: Env, usageId: string, safeToRelease: boolean) {
  await env.DB.prepare(
    "UPDATE usage_records SET status=?,reserved_micros=CASE WHEN ? THEN 0 ELSE reserved_micros END,settled_at=? WHERE id=? AND status='reserved'",
  )
    .bind(safeToRelease ? 'rejected' : 'uncertain', safeToRelease ? 1 : 0, Date.now(), usageId)
    .run();
}
