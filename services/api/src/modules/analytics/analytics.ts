import type { Context } from 'hono';
import { getDb } from '../../db';
import { analytics } from '../../db/schema';

export async function ingestMetricsBatch(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.get('projectId');
  const body = await c.req.json();

  const events = Array.isArray(body.events) ? body.events : [body];

  if (events.length === 0) {
    return c.json({ error: 'Empty payload event parameters' }, 400);
  }

  // P6: cap batch size. A single unbounded insert().values([...]) can blow past
  // SQLite's bound-variable limit (and lets one client flood the analytics
  // table). The SDK flushes far fewer than this per interval, so 100 is safe.
  const MAX_BATCH_SIZE = 100;
  if (events.length > MAX_BATCH_SIZE) {
    return c.json({ error: `Batch exceeds maximum of ${MAX_BATCH_SIZE} events` }, 413);
  }

  // 'step_view' = one step's tooltip was shown (for "total steps shown" metric).
  const VALID_EVENT_TYPES = new Set(['impression', 'next', 'skip', 'complete', 'step_view']);

  const invalidEvent = events.find((e: any) => !VALID_EVENT_TYPES.has(e.eventType));
  if (invalidEvent) {
    return c.json({ error: `Invalid eventType: "${invalidEvent.eventType}"` }, 400);
  }

  // Expose the user to the request logger (events carry it in the body, not the
  // query string) so request_logs has the user_id for analytics calls too.
  const firstUserId = events.find((e: any) => e.userId)?.userId;
  if (firstUserId) c.set('auditUser', String(firstUserId));

  // FIX BUG 5: The original code never wrote `userId` into the insert payload, so every
  // analytics row was stored with userId = null, permanently breaking per-user reporting.
  // The schema already has the column — we just need to read it from the incoming event.
  const insertPayloads = events.map((event: any) => ({
    id: `log_${crypto.randomUUID().replace(/-/g, '')}`,
    projectId,
    tourId: event.tourId || null,
    userId: event.userId || null,   // kept for future per-user / MAU billing
    eventType: event.eventType,     // 'impression' | 'next' | 'skip' | 'complete'
    timestamp: new Date(event.timestamp || Date.now())
  }));

  await db.insert(analytics).values(insertPayloads).run();

  return c.json({ success: true, processed: insertPayloads.length }, 202);
}