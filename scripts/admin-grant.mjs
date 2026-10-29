import { spawnSync } from 'node:child_process';
import { readFile, writeFile, chmod } from 'node:fs/promises';
const email = process.argv[2];
if (!email || !/^[^\s'";]+@[^\s'";]+\.[^\s'";]+$/.test(email)) {
  console.error('用法: pnpm admin:grant user@example.com（先在本地注册）');
  process.exit(1);
}
const query = `SELECT id FROM users WHERE email='${email.replaceAll("'", "''")}' LIMIT 1`;
const child = spawnSync(
  'pnpm',
  ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--command', query, '--json'],
  { encoding: 'utf8', cwd: new URL('..', import.meta.url) },
);
if (child.status !== 0) {
  console.error('本地数据库读取失败。请先运行 pnpm setup。');
  process.exit(1);
}
const output = child.stdout;
const match = output.match(/"id"\s*:\s*"([A-Za-z0-9_-]+)"/);
if (!match) {
  console.error('未找到本地已注册用户。');
  process.exit(1);
}
const path = new URL('../.dev.vars', import.meta.url);
let content = await readFile(path, 'utf8');
const current =
  content
    .match(/^ADMIN_USER_IDS=(.*)$/m)?.[1]
    .split(',')
    .filter(Boolean) ?? [];
const ids = [...new Set([...current, match[1]])].join(',');
content = /^ADMIN_USER_IDS=/m.test(content)
  ? content.replace(/^ADMIN_USER_IDS=.*$/m, `ADMIN_USER_IDS=${ids}`)
  : content + `\nADMIN_USER_IDS=${ids}\n`;
await writeFile(path, content, { mode: 0o600 });
await chmod(path, 0o600);
console.log(
  `已授权本地用户 ${email} 管理权限。重启开发服务后访问 /admin，并再次验证登录密码。生产授权需单独设置 ADMIN_USER_IDS Secret。`,
);
