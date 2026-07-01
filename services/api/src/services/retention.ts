import { getDb } from '../db';
import { analytics, auditLog } from '../db/schema';
import { lt } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// [RETENTION] Daily cron keeps the high-volume log tables bounded for a
// universal SDK (many projects). Deletes audit_log + analytics rows older than
// LOG_RETENTION_DAYS (default 90; "0" = keep forever). tour_cost is NOT pruned
// (billing record).
// ---------------------------------------------------------------------------
const DEFAULT_RETENTION_DAYS = 90;

export async function cleanupOldLogs(env: any): Promise<void> {
  const days = Number(env?.LOG_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  if (!(days > 0)) {
    console.log('[Retention] disabled (LOG_RETENTION_DAYS <= 0)');
    return;
  }

  const db = getDb(env.aitour_db_Vishal);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    await db.delete(auditLog).where(lt(auditLog.createdAt, cutoff)).run();
    await db.delete(analytics).where(lt(analytics.timestamp, cutoff)).run();
    console.log(`[Retention] pruned audit_log + analytics older than ${days}d (before ${cutoff.toISOString()})`);
  } catch (err) {
    console.error('[Retention] cleanup failed:', err);
  }
}
