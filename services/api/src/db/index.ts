import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export interface Env {
  aitour_db_Vishal: D1Database;
  GEMINI_API_KEY: string;
  CRAWLER_API_KEY: string;
  ADMIN_SECRET: string;
  AUTH_JWT_SECRET?: string;  // dashboard JWT signing secret (falls back to ADMIN_SECRET)
  ADMIN_EMAILS?: string;     // comma-separated emails auto-granted admin role on login
  ADMIN_EMAIL?: string;      // separate admin-portal login (no DB account) — email
  ADMIN_PASSWORD?: string;   // separate admin-portal login — password (set via secret)
  AITOUR_KV: KVNamespace;
  KV_ENABLED?: string;       // "true" (default) | "false" — single KV kill-switch
  RATE_LIMIT_MAX?: string;   // default 30 req/min/project; "0" = unlimited
  LOG_RETENTION_DAYS?: string; // default 90; prune audit_log + analytics older than this; "0" = keep forever
  // ── LLM provider (swap without code changes) ──
  AI?: any;                  // Cloudflare Workers AI binding (default provider)
  AI_PROVIDER?: string;      // "cloudflare" (default) | "gemini" | "groq"
  AI_MODEL?: string;         // optional model override for the chosen provider
  GROQ_API_KEY?: string;     // only needed when AI_PROVIDER="groq"
  // ── Billing ("per tour generated") — smallest currency unit (paise/cents) ──
  PRICE_PER_FULL_TOUR?: string; // default 100
  PRICE_PER_DELTA?: string;     // default 50
}

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

// ─── KV kill-switch (single source of truth) ─────────────────────────────────
// Cloudflare's free tier caps KV writes at ~1000/day. The rate-limiter alone
// writes on every request, so this can be exhausted quickly. Flip KV_ENABLED to
// "false" (wrangler.toml [vars] or dashboard) to disable ALL KV reads/writes at
// once — every caller already fails open (auth → D1, rate-limit → allow,
// generation → no cache/lock), so nothing breaks, you just lose the caching.
export function isKvEnabled(env: Env): boolean {
  return String(env.KV_ENABLED ?? 'true').toLowerCase() !== 'false';
}

// No-op KV that satisfies the interface but performs zero reads/writes.
const NOOP_KV = {
  get: async () => null,
  getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  put: async () => undefined,
  delete: async () => undefined,
  list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
} as unknown as KVNamespace;

/** Returns the real KV binding when enabled, else a no-op stub. */
export function getKV(env: Env): KVNamespace {
  return isKvEnabled(env) ? env.AITOUR_KV : NOOP_KV;
}