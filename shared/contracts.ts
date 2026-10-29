import { z } from 'zod';

export const taskStatuses = [
  'draft',
  'analyzing',
  'awaiting_confirmation',
  'ready',
  'generating',
  'reviewing',
  'completed',
  'failed',
  'cancelled',
] as const;
export const stages = ['analyze', 'generate', 'review'] as const;
export type Stage = (typeof stages)[number];
export const analysisSchema = z.object({
  understanding: z.string().max(8000),
  approach: z.array(z.string().max(2000)).max(12),
  technologies: z.array(z.string().max(200)).max(15),
  deliverables: z.array(z.string().max(300)).min(1).max(20),
  complexity: z.enum(['simple', 'medium', 'complex']),
  estimatedTokens: z.number().int().min(0).max(100000),
  questions: z.array(z.string().max(1000)).max(10),
});
export const fileSchema = z.object({
  path: z.string().min(1).max(180),
  language: z.string().max(40),
  content: z.string().max(100000),
});
export const generationSchema = z.object({
  summary: z.string().max(6000),
  files: z.array(fileSchema).min(1).max(20),
  instructions: z.string().max(10000),
});
export const reviewSchema = z.object({
  summary: z.string().max(6000),
  issues: z
    .array(
      z.object({
        severity: z.enum(['info', 'warning', 'critical']),
        file: z.string().max(180),
        message: z.string().max(2000),
      }),
    )
    .max(30),
  coverage: z.array(z.string().max(1000)).max(20),
});
export const settingsSchema = z
  .object({
    totalBudgetUsd: z.number().min(1).max(100000),
    softBudgetUsd: z.number().min(0).max(100000),
    hardBudgetUsd: z.number().min(0.01).max(100000),
    safetyReserveUsd: z.number().min(0).max(100000),
    defaultUserLimitUsd: z.number().min(0.01).max(1000),
    taskLimitUsd: z.number().min(0.01).max(100),
    maxConcurrent: z.number().int().min(1).max(10),
    maxTaskCalls: z.number().int().min(3).max(12),
    maintenance: z.boolean(),
    aiEnabled: z.boolean(),
    modelPrices: z.record(
      z.string().min(1),
      z.object({
        input: z.number().positive().max(1000),
        cached: z.number().nonnegative().max(1000),
        output: z.number().positive().max(1000),
      }),
    ),
  })
  .refine(
    (s) =>
      s.softBudgetUsd <= s.hardBudgetUsd &&
      s.hardBudgetUsd + s.safetyReserveUsd <= s.totalBudgetUsd,
    { message: '软预算必须小于等于硬预算，硬预算加预留必须小于等于总预算。' },
  );
export type PlatformSettings = z.infer<typeof settingsSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type Generation = z.infer<typeof generationSchema>;
export type Review = z.infer<typeof reviewSchema>;
export const defaultSettings: PlatformSettings = {
  totalBudgetUsd: 47,
  softBudgetUsd: 35,
  hardBudgetUsd: 42,
  safetyReserveUsd: 5,
  defaultUserLimitUsd: 3,
  taskLimitUsd: 0.75,
  maxConcurrent: 2,
  maxTaskCalls: 6,
  maintenance: false,
  aiEnabled: true,
  modelPrices: {
    'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
    'gpt-6.1-sol': { input: 2, cached: 0.1, output: 10 },
  },
};
export type TaskStatus = (typeof taskStatuses)[number];
export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  image?: string | null;
};
export type Project = {
  id: string;
  name: string;
  description: string;
  service: string;
  createdAt: number;
  updatedAt: number;
};
export type Task = {
  id: string;
  projectId: string;
  title: string;
  prompt: string;
  status: TaskStatus;
  mode: string;
  analysis: Analysis | null;
  review: Review | null;
  error: string | null;
  calls: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  order?: Order;
};
export type GeneratedFile = {
  id: string;
  projectId: string;
  taskId: string | null;
  path: string;
  language: string;
  content: string;
  version: number;
  createdAt: number;
};
export type Message = {
  id: string;
  role: string;
  content: string;
  kind: string;
  createdAt: number;
};
export type TaskEvent = {
  id: string;
  taskId: string;
  level: string;
  message: string;
  createdAt: number;
};
export type Usage = {
  id: string;
  taskId: string;
  stage: string;
  model: string;
  mode: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  costMicros: number;
  reservedMicros: number;
  status: string;
  requestId: string | null;
  createdAt: number;
};
export type Order = {
  id: string;
  taskId: string;
  status: string;
  kind: string;
  quoteCents: number;
  currency: string;
  approvedAt: number | null;
};
export type TaskDetail = {
  task: Task;
  files: GeneratedFile[];
  messages: Message[];
  events: TaskEvent[];
  usage: Usage[];
  order: Order | null;
  execution: { available: false; label: string };
};
export type Config = {
  mode: 'demo' | 'live';
  liveReady: boolean;
  liveEnabled: boolean;
  registration: boolean;
  storage: string;
  execution: false;
  contact: string | null;
  plans: Plan[];
};
export type Plan = {
  id: string;
  name: string;
  description: string;
  priceLabel: string;
  features: string[];
  taskLimit: number;
  active: boolean;
  highlighted: boolean;
};
export const serviceOptions = [
  { id: 'python', name: 'Python 自动化', description: '让重复工作，自动完成。', icon: 'terminal' },
  { id: 'web', name: '网站与前端', description: '从一个想法，到一方天地。', icon: 'globe' },
  { id: 'bug', name: 'Bug 分析与修复', description: '找到问题，也找到答案。', icon: 'bug' },
  { id: 'api', name: 'API 接口开发', description: '让系统之间，自由对话。', icon: 'braces' },
  { id: 'data', name: '数据处理工具', description: '把繁杂数据，变成价值。', icon: 'database' },
  { id: 'refactor', name: '代码优化与重构', description: '让好代码，再进一步。', icon: 'layers' },
] as const;
export const statusLabels: Record<TaskStatus, string> = {
  draft: '等待分析',
  analyzing: '分析中',
  awaiting_confirmation: '待确认方案',
  ready: '准备生成',
  generating: '生成中',
  reviewing: '审查中',
  completed: '已交付',
  failed: '需要处理',
  cancelled: '已取消',
};
