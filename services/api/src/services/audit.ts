import { getDb } from '../db';
import { auditLog } from '../db/schema';

// ---------------------------------------------------------------------------
// [AUDIT] One row PER EVENT. Every event is its own row (safe + scalable for a
// universal SDK — no row-size limit, no write contention). The event is stored
// as a JSON blob in `log`. All of a project's events = its rows
// (WHERE project_id = ...). Best-effort: never throws.
// ---------------------------------------------------------------------------
export async function writeAuditLog(
  db: ReturnType<typeof getDb>,
  event: Record<string, any>
): Promise<void> {
  try {
    const projectId = event.projectId;
    if (!projectId) return;
    const { projectId: _omit, ...log } = event;
    await db.insert(auditLog).values({
      id: `aud_${crypto.randomUUID().replace(/-/g, '')}`,
      projectId,
      log: JSON.stringify(log),
      createdAt: new Date(),
    }).run();
  } catch (err) {
    console.error('[Audit] write failed:', err);
  }
}
