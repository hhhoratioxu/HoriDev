import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
test('landing, registration, project, demo delivery, version edit and download', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /想法已就绪/ })).toBeVisible();
  if (await page.getByRole('button', { name: '切换浅色模式' }).isVisible())
    await page.getByRole('button', { name: '切换浅色模式' }).click();
  if (testInfo.project.name === 'chromium') {
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/landing-desktop.png', fullPage: true });
    await page.screenshot({ path: 'artifacts/landing-hero.png' });
  }
  await page.goto('/register');
  await page.getByLabel('你的名字').fill(`验收用户 ${testInfo.project.name}`);
  await page.getByLabel('邮箱地址').fill(`qa-${Date.now()}-${testInfo.project.name}@example.test`);
  await page.getByLabel('密码', { exact: true }).fill('HoriDev-test-password-2026');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page).toHaveURL('/dashboard');
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByLabel('项目名称').fill('Excel 日期分类 · 浏览器验收');
  await page
    .getByLabel('你想实现什么？')
    .fill('我需要一个 Python 工具，把 Excel 表格按日期分类，按月导出并拒绝覆盖已有文件。');
  await page.getByRole('button', { name: '创建项目，进入工作区' }).click();
  await expect(page).toHaveURL(/\/workspace\//);
  await page.getByRole('button', { name: '分析需求', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认范围与方案' })).toBeVisible();
  await page.getByRole('button', { name: '确认范围与方案' }).click();
  await page.getByRole('button', { name: '开始生成代码' }).click();
  await expect(page.getByRole('button', { name: '开始 AI 静态审查' })).toBeVisible();
  await page.getByRole('button', { name: '开始 AI 静态审查' }).click();
  await expect(page.getByText('已交付', { exact: true })).toBeVisible();
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  await expect(page.getByText('0 Tokens', { exact: true })).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Editor content', exact: true }).first();
  await input.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n# browser acceptance edit\n');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已保存 · v2', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Diff', exact: true }).click();
  await expect(page.locator('.monaco-diff-editor').first()).toBeVisible();
  if (testInfo.project.name === 'chromium') {
    await page.getByRole('button', { name: '代码', exact: true }).first().click();
    await page.screenshot({ path: 'artifacts/workspace-desktop.png', fullPage: true });
  }
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 ZIP' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.zip');
  await download.saveAs(resolve(`artifacts/qa-delivery-${testInfo.project.name}.zip`));
  await page.getByRole('button', { name: '测试 未启用' }).click();
  await expect(page.getByText('自动化测试尚未启用', { exact: true })).toBeVisible();
  if (testInfo.project.name === 'chromium') {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
    await page.screenshot({ path: 'artifacts/workspace-mobile.png', fullPage: true });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    expect(overflow).toBe(false);
  }
  if (testInfo.project.name === 'chromium') {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: '近期项目' })).toBeVisible();
    await page.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true });
  }
  expect(errors).toEqual([]);
});
test('responsive landing and keyboard navigation with reduced motion', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /想法已就绪/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false,
  );
  if (testInfo.project.name === 'chromium') await page.keyboard.press('Tab');
  else await page.getByRole('link', { name: '跳到主要内容' }).focus();
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  if (testInfo.project.name === 'chromium')
    await page.screenshot({ path: 'artifacts/landing-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '展开导航' }).click();
  await expect(
    page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '如何工作' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '展开导航' }).click();
  await page.getByRole('button', { name: 'api.ts', exact: true }).click();
  await expect(page.locator('.preview-code')).toContainText('const app = new Hono();');
  await expect(page.getByRole('button', { name: 'api.ts', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  if (await page.getByRole('button', { name: '切换深色模式' }).isVisible())
    await page.getByRole('button', { name: '切换深色模式' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('link', { name: '开始创造', exact: true }).first()).toBeVisible();
});
