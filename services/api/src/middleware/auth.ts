import type { Context, Next } from 'hono';
import { getDb, getKV } from '../db';
import { projects } from '../db/schema';
import { eq } from 'drizzle-orm';

const API_KEY_CACHE_TTL = 300; // 5 minutes

// ── S1: Never use the raw API key as a KV key name ──────────────────────────
// The KV key is visible to anyone with KV list/dashboard access. Hashing it
// means a leaked KV listing no longer exposes usable credentials.
async function hashApiKey(apiKey: string): Promise<string> {
  const data = new TextEncoder().encode(apiKey);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── S6 helper: constant-time string comparison ──────────────────────────────
// Avoids leaking the secret length/prefix via early-exit timing differences.
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let mismatch = ab.length !== bb.length ? 1 : 0;
  const len = Math.max(ab.length, bb.length);
  const padded = new Uint8Array(len);
  padded.set(ab);
  for (let i = 0; i < bb.length; i++) {
    mismatch |= (padded[i] ?? 0) ^ bb[i];
  }
  return mismatch === 0;
}

// ── S6: Crawler endpoints were previously unauthenticated ───────────────────
// Any caller could enumerate projectId/contextKey and read back the full DOM
// fingerprint structure. This middleware gates them behind CRAWLER_API_KEY.
export async function crawlerAuthMiddleware(c: Context, next: Next) {
  const provided = c.req.header('Authorization')?.split(' ')[1] ?? '';
  const expected = c.env.CRAWLER_API_KEY ?? '';
  if (!provided || !expected || !timingSafeEqual(provided, expected)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing or invalid Authorization header' }, 401);
  }

  const apiKey = authHeader.split(' ')[1];

  try {
    // ── Fast path: KV cache (S1: keyed by hash, not the raw key) ───────────
    const kv = getKV(c.env);
    const cacheKey = `apikey_${await hashApiKey(apiKey)}`;
    let cached: { id: string; allowedOrigins: string } | null = null;

    try {
      cached = await kv.get(cacheKey, 'json') as { id: string; allowedOrigins: string } | null;
    } catch (kvError) {
      console.warn('[Auth Warning] KV read error — falling back to D1:', kvError);
    }

    let projectId: string;
    let allowedOrigins: string;

    if (cached) {
      projectId = cached.id;
      allowedOrigins = cached.allowedOrigins;
    } else {
      // ── Slow path: D1 lookup ──────────────────────────────────────────
      const db = getDb(c.env.aitour_db_Vishal);
      const project = await db.select().from(projects).where(eq(projects.apiKey, apiKey)).get();

      if (!project) {
        return c.json({ success: false, error: 'Invalid API Key' }, 401);
      }

      // [ADMIN] Suspended clients are rejected outright.
      if (project.blocked) {
        return c.json({ success: false, error: 'This project is suspended' }, 403);
      }

      projectId = project.id;
      allowedOrigins = project.allowedOrigins;

      // Safely attempt KV write
      try {
        await kv.put(cacheKey, JSON.stringify({ id: projectId, allowedOrigins }), {
          expirationTtl: API_KEY_CACHE_TTL,
        });
      } catch (kvError) {
        console.warn('[Auth Warning] KV write error (failing open):', kvError);
      }
    }

    // ── Origin check ──────────────────────────────────────────────────────
    const origin = c.req.header('Origin');
    if (origin && allowedOrigins !== '*') {
      const allowedList = allowedOrigins
        .split(',')
        .map((o: string) => o.trim())
        .filter(Boolean);

      if (!allowedList.includes(origin)) {
        return c.json({ error: 'Origin not permitted' }, 403);
      }
    }

    c.set('projectId', projectId);
    await next();
  } catch (error) {
    console.error('[Auth Error]', error);
    return c.json({ success: false, error: 'Authentication service failure' }, 500);
  }
}
