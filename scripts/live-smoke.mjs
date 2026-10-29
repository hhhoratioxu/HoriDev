import { Miniflare } from 'miniflare';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
if (!process.argv.includes('--allow-paid-api')) {
  console.error(
    '这会消耗真实 OpenAI API 额度。获得授权后运行 ./horidev test:live --allow-paid-api；内部预留硬上限为 $0.09，最终账单可能有差异。',
  );
  process.exit(1);
}
process.loadEnvFile(new URL('../.dev.vars', import.meta.url));
if (!process.env.OPENAI_API_KEY) {
  console.error('本地 .dev.vars 中没有 API 密钥。');
  process.exit(1);
}
const root = new URL('..', import.meta.url);
const mf = new Miniflare({
  modules: [
    { type: 'ESModule', path: new URL('../dist-worker/index.js', import.meta.url).pathname },
  ],
  compatibilityDate: '2026-07-30',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: ['DB'],
  bindings: {
    APP_URL: 'http://localhost:8787',
    APP_ENV: 'development',
    AI_MODE: 'live',
    LIVE_CALLS_ENABLED: 'true',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL_ECONOMY: process.env.OPENAI_MODEL_ECONOMY ?? 'gpt-6-luna',
    OPENAI_MODEL_STANDARD: process.env.OPENAI_MODEL_STANDARD ?? 'gpt-6.1-sol',
    BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
    OPENAI_TIMEOUT_MS: '120000',
  },
});
const origin = 'http://localhost:8787';
let cookie = '';
const report = {
  date: new Date().toISOString(),
  mode: 'live',
  budget: { internalHardUsd: 0.09 },
  scope:
    'isolated local Workers/D1 acceptance; manual order fixture; generated source never executed',
  stages: [],
  usage: [],
  passed: false,
};
const call = async (path, method = 'GET', body) => {
  const response = await mf.dispatchFetch(origin + '/api' + path, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Cookie: cookie,
      'cf-connecting-ip': '192.0.2.99',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return response;
};
try {
  const database = await mf.getD1Database('DB');
  for (const name of (await readdir(new URL('migrations/', root)))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    for (const sql of (await readFile(new URL(`migrations/${name}`, root), 'utf8'))
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean))
      await database.prepare(sql).run();
  const setting = await database
    .prepare("SELECT value FROM platform_settings WHERE key='budget'")
    .first();
  const config = JSON.parse(setting.value);
  Object.assign(config, {
    softBudgetUsd: 0.07,
    hardBudgetUsd: 0.09,
    safetyReserveUsd: 46.91,
    taskLimitUsd: 0.09,
    defaultUserLimitUsd: 0.09,
    maxConcurrent: 1,
    maxTaskCalls: 3,
  });
  await database
    .prepare("UPDATE platform_settings SET value=? WHERE key='budget'")
    .bind(JSON.stringify(config))
    .run();
  const signup = await call('/auth/sign-up/email', 'POST', {
    name: '真实 API 验收（临时账号）',
    email: `qa-${randomUUID()}@example.test`,
    password: randomBytes(24).toString('base64url'),
  });
  if (signup.status !== 200) throw new Error('临时验收账号创建失败。');
  cookie = signup.headers.get('set-cookie').split(';')[0];
  const project = await (
    await call('/projects', 'POST', { name: 'Live API 验收 · 文本行数统计', service: 'python' })
  ).json();
  const task = await (
    await call('/tasks', 'POST', {
      projectId: project.id,
      prompt:
        '请编写一个小型 Python 3 命令行工具，读取一个 UTF-8 文本文件，输出非空行数。接受一个文件路径参数；文件不存在或无法解码时友好提示并非零退出。只交付 main.py 和 README.md，不依赖第三方包，不声称运行过测试。没有其他需求，也无需提问。',
    })
  ).json();
  if (!task.id) throw new Error('创建任务失败。');
  await database
    .prepare(
      "UPDATE orders SET status='processing',approved_at=?,approved_by='local-acceptance' WHERE task_id=?",
    )
    .bind(Date.now(), task.id)
    .run();
  for (const stage of ['analyze', 'generate', 'review']) {
    const response = await call(`/tasks/${task.id}/run`, 'POST', { stage });
    const text = await response.text();
    if (response.status !== 200 || !text.includes('event: complete')) {
      const errorLine = text
        .split('\n')
        .find((line) => line.startsWith('data:') && line.includes('"code"'));
      throw new Error(`${stage}: ${errorLine ?? text.slice(0, 500)}`);
    }
    report.stages.push({ stage, status: 'completed' });
    console.log(`${stage}: completed`);
    if (stage === 'analyze') {
      const confirm = await call(`/tasks/${task.id}/confirm`, 'POST', { scopeVersion: 1 });
      if (confirm.status !== 200) throw new Error('范围确认失败。');
    }
  }
  const zip = await call(`/projects/${project.id}/export`);
  if (zip.status !== 200) throw new Error('ZIP 导出失败。');
  await mkdir(new URL('artifacts/', root), { recursive: true });
  await writeFile(
    new URL('artifacts/live-delivery.zip', root),
    new Uint8Array(await zip.arrayBuffer()),
  );
  report.passed = true;
} catch (error) {
  report.error = String(error.message).replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]');
  console.error(report.error);
  process.exitCode = 1;
} finally {
  const database = await mf.getD1Database('DB');
  try {
    report.usage = (
      await database
        .prepare(
          'SELECT stage,model,input_tokens,output_tokens,cached_tokens,cost_micros,reserved_micros,status,request_id FROM usage_records',
        )
        .all()
    ).results;
  } catch {
    /* Initialization may have failed. */
  }
  await mkdir(new URL('artifacts/', root), { recursive: true });
  await writeFile(
    new URL('artifacts/live-smoke-report.json', root),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    `真实 API 验收报告已保存；已知估算 $${(report.usage.reduce((s, u) => s + u.cost_micros, 0) / 1000000).toFixed(6)}。未知预留另见报告。`,
  );
  await mf.dispose();
}
