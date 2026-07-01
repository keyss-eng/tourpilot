import type { Context, Next } from 'hono';
import { getKV } from '../db';

const RATE_LIMIT_WINDOW_TTL = 60;      // seconds
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 30;

export async function rateLimiter(c: Context, next: Next) {
  // Single source of truth — when KV is disabled this is a no-op (fails open).
  const kv = getKV(c.env);
  // Configurable per-minute cap (env RATE_LIMIT_MAX); 0/negative = unlimited.
  const maxRequests = Number(c.env.RATE_LIMIT_MAX ?? DEFAULT_MAX_REQUESTS_PER_WINDOW);
  if (maxRequests <= 0) { await next(); return; }
  const identifier = c.get('projectId') || c.req.header('cf-connecting-ip') || 'anonymous';
  const bucket = Math.floor(Date.now() / 60000);
  const key = `rate_${identifier}_${bucket}`;

  try {
    const val = await kv.get(key);
    const count = val ? parseInt(val, 10) + 1 : 1;

    if (count > maxRequests) {
      c.header('Retry-After', RATE_LIMIT_WINDOW_TTL.toString());
      return c.json({ success: false, error: 'Too many requests. Please try again later.' }, 429);
    }

    // Set with standard TTL (120 seconds is enough to outlive the 60s time bucket window)
    await kv.put(key, count.toString(), { expirationTtl: 120 });
  } catch (err) {
    // If KV is unavailable, fail open (don't block real users)
    console.error('[RateLimit] KV error — failing open:', err);
  }

  await next();
}
