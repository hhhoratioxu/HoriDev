import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { parse } from 'jsonc-parser';
const configErrors = [];
const config = parse(
  await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
  configErrors,
  { allowTrailingComma: true },
);
if (configErrors.length) {
  console.error('Wrangler 配置存在语法错误，尚未联系 Cloudflare。');
  process.exit(1);
}
const production = config.env?.production;
if (
  !production?.vars?.APP_URL?.startsWith('https://') ||
  production.vars.APP_URL.includes('YOUR-DOMAIN') ||
  production.d1_databases?.some((d) => d.database_id.startsWith('00000000-'))
) {
  console.error(
    '尚未配置真实生产域名和 D1 ID。请先按 docs/DEPLOYMENT.md 完成配置；此命令没有创建或修改云端资源。',
  );
  process.exit(1);
}
if (process.argv.includes('--check-only')) process.exit(0);
for (const args of [['build:web'], ['exec', 'wrangler', 'deploy', '--env', 'production']]) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit', cwd: new URL('..', import.meta.url) });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
