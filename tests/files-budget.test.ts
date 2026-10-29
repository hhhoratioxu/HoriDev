import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { validatePath, validateFiles, latestFiles, exportZip } from '../worker/lib/files';
import { costMicros, reservationMicros } from '../worker/services/budget';
import { defaultSettings, settingsSchema, generationSchema } from '../shared/contracts';
import { redact } from '../worker/lib/errors';
import type { GeneratedFile } from '../shared/contracts';
const file = (path: string, version = 1, content = 'hello'): GeneratedFile => ({
  id: `f${version}`,
  projectId: 'p',
  taskId: 't',
  path,
  version,
  content,
  language: 'plaintext',
  createdAt: 0,
});
describe('untrusted file boundaries', () => {
  it.each([
    '../secret.py',
    '/etc/passwd.txt',
    'src/../../x.ts',
    'a\\b.py',
    'x%2f.py',
    'a//b.py',
    '.env',
    '.env.local',
    '.dev.vars',
    '.git/config.txt',
    'x.exe',
    'x\0.py',
    'a:b.py',
  ])('rejects %s', (path) => expect(() => validatePath(path)).toThrow());
  it('accepts relative nested source and README', () => {
    expect(validatePath('src/tools/main.py')).toBe('src/tools/main.py');
    expect(validatePath('README.md')).toBe('README.md');
  });
  it('limits bytes, file count, and duplicate case-insensitive paths', () => {
    expect(() => validateFiles([{ path: 'x.py', content: '中'.repeat(40000) }])).toThrow();
    expect(() =>
      validateFiles([
        { path: 'x.py', content: 'a' },
        { path: 'X.py', content: 'b' },
      ]),
    ).toThrow();
    expect(() =>
      validateFiles(Array.from({ length: 21 }, (_, i) => ({ path: `${i}.ts`, content: '' }))),
    ).toThrow();
  });
  it('exports exact UTF-8 file contents without mixing history', () => {
    const files = latestFiles([
      file('main.py', 1, 'old'),
      file('main.py', 2, '中文\nnew'),
      file('README.md', 1, 'readme'),
    ]);
    const zip = unzipSync(exportZip(files));
    expect(Object.keys(zip)).toEqual(['main.py', 'README.md', 'HORIDEV-DELIVERY.txt']);
    expect(strFromU8(zip['main.py'])).toBe('中文\nnew');
  });
});
describe('cost and budget invariants', () => {
  it('calculates cached and non-cached usage with integer microdollars', () => {
    const p = { input: 2, cached: 0.1, output: 10 };
    expect(costMicros(1000, 200, 300, p)).toBe(4620);
    expect(costMicros(1, 0, 1, { input: 0.1, cached: 0.01, output: 0.5 })).toBe(1);
  });
  it('reserves more than known token costs with schema and safety headroom', () => {
    const p = defaultSettings.modelPrices['gpt-6-luna'];
    expect(reservationMicros(10000, 3000, p)).toBeGreaterThan(costMicros(10000, 0, 3000, p));
  });
  it('rejects hard budget plus reserve beyond total', () => {
    expect(settingsSchema.safeParse({ ...defaultSettings, hardBudgetUsd: 45 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...defaultSettings, softBudgetUsd: 43 }).success).toBe(false);
  });
  it('rejects malformed structured generation', () => {
    expect(generationSchema.safeParse({ summary: 'x', files: [], instructions: 'x' }).success).toBe(
      false,
    );
  });
  it('redacts tokens and Authorization headers', () => {
    expect(redact('key sk-proj-private-example Bearer abc123')).toBe(
      'key [REDACTED] Bearer [REDACTED]',
    );
  });
});
