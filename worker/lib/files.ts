import { AppError } from './errors';
import type { GeneratedFile } from '../../shared/contracts';
import { strToU8, zipSync } from 'fflate';

const allowed = new Set([
  'py',
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'md',
  'txt',
  'html',
  'css',
  'sql',
  'yaml',
  'yml',
  'toml',
  'csv',
  'sh',
  'gitignore',
  'svg',
  'xml',
  'ini',
  'cfg',
  'example',
  'lock',
]);
export function validatePath(path: string) {
  if (
    path.length > 180 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    [...path].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
    /[:%]/.test(path) ||
    path
      .split('/')
      .some(
        (p) =>
          !p ||
          p === '.' ||
          p === '..' ||
          p.startsWith('.env') ||
          p.startsWith('.dev.vars') ||
          p.toLowerCase() === '.git',
      )
  )
    throw new AppError('UNSAFE_PATH', '文件路径不安全，或包含敏感配置文件名。');
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (!allowed.has(ext)) throw new AppError('FILE_TYPE', '仅支持受限的源码与文本文件格式。');
  return path;
}
export function validateFiles(files: { path: string; content: string }[]) {
  if (!files.length || files.length > 20) throw new AppError('FILE_COUNT', '每次最多 20 个文件。');
  const paths = new Set<string>();
  let bytes = 0;
  for (const file of files) {
    validatePath(file.path);
    if (paths.has(file.path.toLowerCase()))
      throw new AppError('DUPLICATE_PATH', '文件名重复（忽略大小写）。');
    paths.add(file.path.toLowerCase());
    const size = new TextEncoder().encode(file.content).length;
    if (size > 100000 || file.content.includes('\0'))
      throw new AppError('FILE_SIZE', '单个文件必须为小于 100 KB 的文本。');
    bytes += size;
  }
  if (bytes > 500000) throw new AppError('PROJECT_SIZE', '项目上下文最多 500 KB。');
}
export function latestFiles(files: GeneratedFile[]) {
  const map = new Map<string, GeneratedFile>();
  for (const file of files)
    if (!map.has(file.path) || map.get(file.path)!.version < file.version) map.set(file.path, file);
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}
export function exportZip(files: GeneratedFile[]) {
  validateFiles(files);
  const data: Record<string, Uint8Array> = {};
  for (const file of files) data[file.path] = strToU8(file.content);
  data['HORIDEV-DELIVERY.txt'] = strToU8(
    'HoriDev 源码交付\n此项目由 AI 生成或由用户编辑。AI 静态审查不代表程序已运行或测试通过。请在合适的隔离环境中审查和验证后使用。\n',
  );
  return zipSync(data, { level: 6 });
}
