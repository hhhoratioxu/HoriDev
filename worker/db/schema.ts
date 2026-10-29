import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user').on(t.userId)],
);
export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('account_user').on(t.userId),
    uniqueIndex('account_provider').on(t.providerId, t.accountId),
  ],
);
export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    service: text('service').notNull().default('python'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('project_user').on(t.userId)],
);
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    prompt: text('prompt').notNull(),
    status: text('status').notNull().default('draft'),
    mode: text('mode').notNull(),
    analysis: text('analysis', { mode: 'json' }),
    review: text('review', { mode: 'json' }),
    error: text('error'),
    calls: integer('calls').notNull().default(0),
    version: integer('version').notNull().default(1),
    runId: text('run_id'),
    cancelRequested: integer('cancel_requested', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('task_user').on(t.userId), index('task_project').on(t.projectId)],
);
export const taskMessages = sqliteTable(
  'task_messages',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    kind: text('kind').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('message_task').on(t.taskId)],
);
export const generatedFiles = sqliteTable(
  'generated_files',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    path: text('path').notNull(),
    language: text('language').notNull(),
    content: text('content').notNull(),
    version: integer('version').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('file_version').on(t.projectId, t.path, t.version),
    index('file_project').on(t.projectId),
  ],
);
export const usageRecords = sqliteTable(
  'usage_records',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    stage: text('stage').notNull(),
    model: text('model').notNull(),
    mode: text('mode').notNull(),
    inputTokens: integer('input_tokens'),
    cachedTokens: integer('cached_tokens'),
    outputTokens: integer('output_tokens'),
    costMicros: integer('cost_micros').notNull().default(0),
    reservedMicros: integer('reserved_micros').notNull().default(0),
    priceSnapshot: text('price_snapshot', { mode: 'json' }),
    status: text('status').notNull(),
    requestId: text('request_id'),
    createdAt: integer('created_at').notNull(),
    settledAt: integer('settled_at'),
  },
  (t) => [
    index('usage_user').on(t.userId),
    index('usage_status').on(t.status),
    index('usage_task').on(t.taskId),
  ],
);
export const pricingPlans = sqliteTable('pricing_plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  priceLabel: text('price_label').notNull(),
  features: text('features', { mode: 'json' }).notNull(),
  taskLimit: integer('task_limit').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  highlighted: integer('highlighted', { mode: 'boolean' }).notNull().default(false),
});
export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .unique()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  status: text('status').notNull(),
  kind: text('kind').notNull(),
  quoteCents: integer('quote_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  approvedAt: integer('approved_at'),
  approvedBy: text('approved_by'),
  createdAt: integer('created_at').notNull(),
});
export const platformSettings = sqliteTable('platform_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').notNull(),
});
export const userQuotas = sqliteTable('user_quotas', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  limitMicros: integer('limit_micros').notNull(),
});
export const taskEvents = sqliteTable(
  'task_events',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    level: text('level').notNull(),
    message: text('message').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('event_task').on(t.taskId)],
);
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: integer('reset_at').notNull(),
});
export const adminAudit = sqliteTable('admin_audit', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  createdAt: integer('created_at').notNull(),
});
