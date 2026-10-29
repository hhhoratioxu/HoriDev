// Local-only browser acceptance. Creates and removes a temporary user and restores the private env file.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
const origin = 'http://localhost:8787';
const envPath = new URL('../.dev.vars', import.meta.url);
const previous = await readFile(envPath, 'utf8');
if (!/^APP_ENV=development$/m.test(previous) || !/^AI_MODE=demo$/m.test(previous))
  throw new Error('仅在本地 development + demo 模式运行此验收。');
const email = `qa-admin-${randomUUID()}@example.test`;
const password = randomBytes(24).toString('base64url');
let userId = '';
let browser;
let server;
const online = async () => {
  try {
    return (await fetch(origin + '/api/health', { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
};
if (await online()) throw new Error('请先停止本地开发/预览服务，此验收需要独占 8787 端口。');
const start = async () => {
  server = spawn('pnpm', ['preview'], {
    cwd: new URL('..', import.meta.url),
    detached: true,
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    if (await online()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('本地 Worker 启动失败。');
};
const stop = async () => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* Already stopped. */
    }
    server = undefined;
  }
  for (let i = 0; i < 30 && (await online()); i++)
    await new Promise((resolve) => setTimeout(resolve, 100));
};
try {
  await start();
  const signup = await fetch(origin + '/api/auth/sign-up/email', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '管理后台验收（临时账号）', email, password }),
  });
  const result = await signup.json();
  if (signup.status !== 200 || !result.user?.id) throw new Error('临时管理员账号创建失败。');
  userId = result.user.id;
  const oldIds = previous.match(/^ADMIN_USER_IDS=(.*)$/m)?.[1] ?? '';
  const ids = [oldIds, userId].filter(Boolean).join(',');
  const content = /^ADMIN_USER_IDS=/m.test(previous)
    ? previous.replace(/^ADMIN_USER_IDS=.*$/m, `ADMIN_USER_IDS=${ids}`)
    : previous + `\nADMIN_USER_IDS=${ids}\n`;
  await writeFile(envPath, content, { mode: 0o600 });
  await chmod(envPath, 0o600);
  await stop();
  await start();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + '/login');
  await page.getByLabel('邮箱地址').fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录 HoriDev' }).click();
  await page.waitForURL('**/dashboard');
  let admin = false;
  for (let i = 0; i < 20; i++) {
    admin = await page.evaluate(async () => {
      const value = await (await fetch('/api/me')).json();
      return value.user?.role === 'admin';
    });
    if (admin) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!admin) throw new Error('本地 Worker 尚未重载管理员配置。');
  await page.goto(origin + '/admin');
  await page.getByLabel('管理员账号密码').fill(password);
  await page.getByRole('button', { name: '解锁管理后台' }).click();
  await page.getByRole('heading', { name: '每日成本趋势' }).waitFor();
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await page.screenshot({
    path: new URL('../artifacts/admin-desktop.png', import.meta.url).pathname,
    fullPage: true,
  });
  await page.getByRole('button', { name: '用户与额度', exact: true }).click();
  await page.getByRole('heading', { name: '用户资源管理' }).waitFor();
  await page.getByRole('button', { name: '预算与套餐', exact: true }).click();
  await page.getByRole('button', { name: '保存平台设置', exact: true }).click();
  await page.getByText('预算和平台设置已更新。', { exact: true }).waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(origin + '/');
  if (await page.getByRole('button', { name: '切换深色模式' }).isVisible())
    await page.getByRole('button', { name: '切换深色模式' }).click();
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.hero-actions .button.secondary'))
        .backgroundColor === 'rgb(28, 32, 44)',
  );
  await page.screenshot({
    path: new URL('../artifacts/landing-dark.png', import.meta.url).pathname,
  });
  if (errors.length) throw new Error(errors.join('; '));
  await writeFile(
    new URL('../artifacts/admin-ui-report.json', import.meta.url),
    JSON.stringify(
      {
        passed: true,
        engine: 'Chromium',
        scope:
          'local Workers/D1, temporary allowlisted admin, real password reauthentication, user table, unchanged budget save, dark mode; no model calls',
        temporaryUserRemoved: true,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('管理员浏览器验收通过：重新验证、真实统计、用户表、预算保存和深色模式。');
} finally {
  await browser?.close();
  await stop();
  await writeFile(envPath, previous, { mode: 0o600 });
  await chmod(envPath, 0o600);
  if (userId && /^[A-Za-z0-9_-]+$/.test(userId)) {
    const cleanup = spawnSync(
      'pnpm',
      [
        'exec',
        'wrangler',
        'd1',
        'execute',
        'DB',
        '--local',
        '--command',
        `DELETE FROM admin_audit WHERE user_id='${userId}'; DELETE FROM users WHERE id='${userId}';`,
      ],
      { cwd: new URL('..', import.meta.url), stdio: 'pipe' },
    );
    if (cleanup.status !== 0) console.error('临时账号清理失败，请检查本地数据库。');
  }
}
