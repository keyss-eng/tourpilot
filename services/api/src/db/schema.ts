import { sqliteTable, text, integer, index, uniqueIndex, customType } from 'drizzle-orm/sqlite-core';

const customTimestamp = customType<{ data: Date; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value: Date): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  },
  fromDriver(value: string): Date {
    return new Date(value);
  },
});

export function timestamp(name: string, config?: { mode: 'timestamp' }) {
  return customTimestamp(name);
}

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  apiKey: text('api_key').notNull().unique(),
  allowedOrigins: text('allowed_origins').notNull(),
  // [BILLING] Subscription tier — 'free' | 'starter' | 'growth' | 'pro'.
  plan: text('plan').default('free'),
  // [SETTINGS] Per-client tour element config — JSON of enabled categories,
  // e.g. {"buttons":true,"links":true,...}. NULL = use defaults.
  tourConfig: text('tour_config'),
  // [ADMIN] Blocked clients are rejected by the API (owner can suspend a client).
  blocked: integer('blocked', { mode: 'boolean' }).notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'timestamp' }).notNull()
}, (table) => ({
  apiKeyIdx: index('api_key_idx').on(table.apiKey),
  // ✅ FIX: Same origin se multiple projects block karo
  originUniqIdx: uniqueIndex('origin_uniq_idx').on(table.allowedOrigins),
}));

// ---------------------------------------------------------------------------
// [BILLING] plans — subscription tiers, editable at runtime (no redeploy to
// change a price/limit). `projects.plan` references a row's `name`. All money in
// the smallest currency unit (paise/cents). monthlyLimit NULL = unlimited.
// ---------------------------------------------------------------------------
export const plans = sqliteTable('plans', {
  name: text('name').primaryKey(),                 // 'free' | 'starter' | 'growth' | 'pro' | ...
  monthlyLimit: integer('monthly_limit'),          // max active users (MAU); NULL = unlimited
  maxToursGenerated: integer('max_tours_generated'), // max tours that can be generated; NULL = unlimited
  maxToursShown: integer('max_tours_shown'),       // max tour views per month; NULL = unlimited
  price: integer('price').notNull().default(0),    // MONTHLY price in USD cents (100 = $1)
  priceYearly: integer('price_yearly').notNull().default(0), // YEARLY price in USD cents
  overagePerMau: integer('overage_per_mau').notNull().default(0), // charge per MAU above limit (cents)
  createdAt: timestamp('created_at', { mode: 'timestamp' }).notNull(),
});

// ---------------------------------------------------------------------------
// [AUTH] accounts — dashboard login users. One account owns one project (the
// project it created at signup). Password is PBKDF2-hashed (Web Crypto). The
// dashboard authenticates with a JWT whose `projectId` claim scopes all data.
// ---------------------------------------------------------------------------
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('client'), // 'client' | 'admin'
  createdAt: timestamp('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  accountEmailIdx: uniqueIndex('account_email_idx').on(table.email),
  accountProjectIdx: index('account_project_idx').on(table.projectId),
}));

// ---------------------------------------------------------------------------
// [OPT-6] Tours table — added version chain (replacedBy), generation source
// tracking, and pre-computed totalSteps to avoid JSON.parse() in guard queries.
// ---------------------------------------------------------------------------
export const tours = sqliteTable('tours', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  contextKey: text('context_key').notNull(),
  versionHash: text('version_hash').notNull(),
  versionHashWithFp: text('version_hash_with_fp'),
  structureHash: text('structure_hash'),        // Guard 4
  zoneHashesJson: text('zone_hashes_json'),     // Guard 5
  countHash: text('count_hash'),                // Guard 6
  semanticHash: text('semantic_hash'),          // Guard 7
  stepsJson: text('steps_json').notNull(),
  elementFingerprints: text('element_fingerprints'),
  payloadJson: text('payload_json'),
  payloadHash: text('payload_hash'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  // [OPT-6] Version chain — which tour replaced this one
  replacedBy: text('replaced_by'),
  // [OPT-6] How was this tour generated? Useful for analytics & debugging
  generationSource: text('generation_source'),  // 'sdk' | 'crawler' | 'partial_regen'
  // [OPT-10] Pre-computed step count — eliminates JSON.parse(stepsJson).length in all guards
  totalSteps: integer('total_steps'),
  // [AUTO-REGEN] The UI build/version this tour was generated for. When a request
  // arrives with a DIFFERENT uiVersion (developer shipped a UI change), the tour
  // is invalidated and regenerated fresh. null = feature unused (pure freeze).
  uiVersion: text('ui_version'),
  createdAt: timestamp('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  // [OPT-8] REMOVED dead index: context_hash_idx (contextKey, versionHash) — never queried without projectId
  // [OPT-8] Covering index for fetchActiveTour (projectId + contextKey + isActive)
  activeTourLookupIdx: index('active_tour_lookup_idx').on(table.projectId, table.contextKey, table.isActive),
  activeContextIdx: index('active_context_idx').on(table.projectId, table.contextKey),
  payloadHashIdx: index('payload_hash_idx').on(table.projectId, table.contextKey, table.payloadHash),
  structureHashIdx: index('structure_hash_idx').on(table.projectId, table.contextKey, table.structureHash),
  countHashIdx: index('count_hash_idx').on(table.projectId, table.contextKey, table.countHash),
  semanticHashIdx: index('semantic_hash_idx').on(table.projectId, table.contextKey, table.semanticHash),
}));

// ---------------------------------------------------------------------------
// [OPT-1/2/3/5/7] user_progress — Single row per (userId, tourId) with upsert.
// Status enum enforced, full datetime timestamps, status history tracking,
// and server-side step progress for cross-device resume.
// ---------------------------------------------------------------------------
export const VALID_STATUSES = ['started', 'completed', 'dismissed', 'maybe_later', 'pending'] as const;
export type ValidStatus = typeof VALID_STATUSES[number];

export const userProgress = sqliteTable('user_progress', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  tourId: text('tour_id').notNull().references(() => tours.id, { onDelete: 'cascade' }),
  // [OPT-3] Enum-constrained status — compile-time type safety
  status: text('status').notNull(),  // Runtime-validated via VALID_STATUSES
  // [OPT-2] completedAt — ONLY set when status = 'completed'
  completedAt: timestamp('completed_at', { mode: 'timestamp' }),
  // [OPT-2] lastInteractionAt — updated on EVERY status change (full datetime)
  lastInteractionAt: timestamp('last_interaction_at', { mode: 'timestamp' }),
  // [OPT-7] Server-side resume point — survives browser data wipe
  lastCompletedStep: integer('last_completed_step').default(0),
  // [OPT-5] Full lifecycle audit trail: [{status, at}]
  statusHistory: text('status_history'),
  updatedAt: timestamp('updated_at', { mode: 'timestamp' }),
  createdAt: timestamp('created_at', { mode: 'timestamp' }).notNull()
}, (table) => ({
  // [OPT-1] Guarantees single row per (projectId, userId, tourId)
  userTourUniqueIdx: uniqueIndex('user_tour_unique_idx').on(table.projectId, table.userId, table.tourId),
  projectUserIdx: index('project_user_idx').on(table.projectId, table.userId),
  // [OPT-8] Status-based lookup for batch operations (e.g. reset to 'pending' on regen)
  userStatusIdx: index('user_status_idx').on(table.userId, table.status),
}));

// ---------------------------------------------------------------------------
// [DB-5] Analytics — captures SDK telemetry events.
// ---------------------------------------------------------------------------
export const analytics = sqliteTable('analytics', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  tourId: text('tour_id').references(() => tours.id, { onDelete: 'set null' }),
  userId: text('user_id'),
  eventType: text('event_type').notNull(),
  timestamp: timestamp('timestamp', { mode: 'timestamp' }).notNull()
}, (table) => ({
  projectTimeIdx: index('project_time_idx').on(table.projectId, table.timestamp),
  projectTourIdx: index('project_tour_idx').on(table.projectId, table.tourId),
  analyticsProjectUserIdx: index('project_user_analytics_idx').on(table.projectId, table.userId),
  projectEventIdx: index('project_event_idx').on(table.projectId, table.eventType),
}));

// ---------------------------------------------------------------------------
// [BILLING] mau_monthly — permanent monthly billing snapshot per project. MAU is
// computed from `analytics` (COUNT DISTINCT user_id in the month) and frozen here
// with the plan + amount so the invoice survives analytics retention. One row per
// (project, month). Written/updated by the daily cron.
// ---------------------------------------------------------------------------
export const mauMonthly = sqliteTable('mau_monthly', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  month: text('month').notNull(),          // "YYYY-MM"
  mau: integer('mau').default(0),          // distinct active users that month
  plan: text('plan'),                      // plan snapshot
  baseFee: integer('base_fee').default(0), // plan price (smallest currency unit)
  overage: integer('overage').default(0),  // extra-MAU charge
  amountDue: integer('amount_due').default(0), // base + overage = CLIENT bill
  createdAt: timestamp('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  mauProjectMonthIdx: uniqueIndex('mau_project_month_idx').on(table.projectId, table.month),
}));

// ---------------------------------------------------------------------------
// [AUDIT] Audit log — every significant event for a project as a single JSON
// blob (`log`). Not tied to any file/entity: just project_id + the event JSON +
// time. Covers generate / complete / dismiss / error (and anything future — add
// a field to the JSON, no schema change). Populated server-side only.
// ---------------------------------------------------------------------------
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  log: text('log'),                      // JSON: { action, entity, tourId, page, userId, ... }
  createdAt: timestamp('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  auditProjectTimeIdx: index('audit_project_time_idx').on(table.projectId, table.createdAt),
}));

// ---------------------------------------------------------------------------
// [BILLING] tour_cost — one row per LLM generation. The billable-event log:
// pricing is "per tour generated", so COUNT(rows) × rate = the client charge.
// Also records tokens + our provider cost (margin). Project-level only (no
// per-user / gen_type breakdown). Written after every successful generation.
// ---------------------------------------------------------------------------
export const tourCost = sqliteTable('tour_cost', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  contextKey: text('context_key').notNull(),     // the PAGE this generation was for
  provider: text('provider'),                    // 'cloudflare' | 'gemini' | 'groq'
  model: text('model'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  providerCostMicroUsd: integer('provider_cost_micro_usd').default(0), // OUR cost (micro-USD)
  billableAmount: integer('billable_amount').default(0),               // CLIENT charge (smallest currency unit)
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  costProjectTimeIdx: index('cost_project_time_idx').on(table.projectId, table.createdAt),
  costProjectContextIdx: index('cost_project_context_idx').on(table.projectId, table.contextKey),
}));

