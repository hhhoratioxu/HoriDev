import { readFile, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const path = new URL('../.dev.vars', import.meta.url);
let content = '';
try {
  content = await readFile(path, 'utf8');
} catch {
  /* First run: a private env file will be created. */
}
const defaults = {
  BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
  APP_ENV: 'development',
  APP_URL: 'http://localhost:5173',
  AI_MODE: 'demo',
  LIVE_CALLS_ENABLED: 'false',
  OPENAI_MODEL_ECONOMY: 'gpt-6-luna',
  OPENAI_MODEL_STANDARD: 'gpt-6.1-sol',
};
for (const [key, value] of Object.entries(defaults))
  if (!new RegExp(`^${key}=`, 'm').test(content)) content += `\n${key}=${value}\n`;
await writeFile(path, content, { mode: 0o600 });
await chmod(path, 0o600);
console.log('本地私有配置已就绪；已有值与 API 密钥保持不变。默认演示模式，无付费调用。');
