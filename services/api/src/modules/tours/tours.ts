import type { Context } from 'hono';
import { getDb } from '../../db';
import { tours, userProgress } from '../../db/schema';
import type { ValidStatus } from '../../db/schema';
import { VALID_STATUSES } from '../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { isValidStep } from '../../services/pipeline';
import { isValidTransition, appendStatusHistory } from '../../services/status-machine';
import { writeAuditLog } from '../../services/audit';

// ---------------------------------------------------------------------------
// R-5: Parse and validate stepsJson in one place.
// ---------------------------------------------------------------------------
function parseTourSteps(stepsJson: string, tourId: string): Record<string, any>[] {
  try {
    const parsed = JSON.parse(stepsJson);
    if (!Array.isArray(parsed)) {
      console.error('[Tours] stepsJson is not an array for tour', tourId);
      return [];
    }
    const valid = parsed.filter(isValidStep);
    if (valid.length < parsed.length) {
      console.warn(
        `[Tours] ${parsed.length - valid.length} step(s) dropped after schema validation for tour ${tourId}`
      );
    }
    return valid;
  } catch {
    console.error('[Tours] Failed to parse stepsJson for tour', tourId);
    return [];
  }
}

// ---------------------------------------------------------------------------
// [OPT-1] Upsert helper — single row per (userId, tourId).
// Uses INSERT ... ON CONFLICT (userId, tourId) DO UPDATE SET ...
// ---------------------------------------------------------------------------
async function upsertProgress(
  db: ReturnType<typeof getDb>,
  params: {
    projectId: string;
    userId: string;
    tourId: string;
    status: ValidStatus;
    step?: number;
  }
): Promise<{ success: boolean; idempotent?: boolean; error?: string }> {
  const { projectId, userId, tourId, status, step } = params;
  const now = new Date();

  // [OPT-9] Check existing row for idempotency + state machine validation
  const existing = await db.select()
    .from(userProgress)
    .where(and(eq(userProgress.userId, userId), eq(userProgress.tourId, tourId)))
    .get();

  // [OPT-9] Idempotent replay — if status hasn't changed, skip the update
  if (existing && existing.status === status && status !== 'started') {
    return { success: true, idempotent: true };
  }

  // [OPT-4] State machine — validate the transition
  const currentStatus = existing ? existing.status as ValidStatus : null;
  if (!isValidTransition(currentStatus, status)) {
    console.warn(`[Tours] Invalid transition: ${currentStatus} → ${status} for user=${userId}, tour=${tourId}`);
    return { success: false, error: `Invalid status transition: ${currentStatus} → ${status}` };
  }

  // [OPT-5] Append to status history
  const history = appendStatusHistory(existing?.statusHistory, status);

  // [OPT-2] completedAt — ONLY set on actual 'completed' status
  const completedAt = status === 'completed' ? now : (existing?.completedAt ?? null);

  // [OPT-7] Step progress — update if provided and is a higher step
  const lastStep = step !== undefined
    ? Math.max(step, existing?.lastCompletedStep ?? 0)
    : (existing?.lastCompletedStep ?? 0);

  if (existing) {
    // UPDATE path
    await db.update(userProgress)
      .set({
        status,
        completedAt,
        lastInteractionAt: now,
        lastCompletedStep: lastStep,
        statusHistory: JSON.stringify(history),
        updatedAt: now,
      })
      .where(eq(userProgress.id, existing.id))
      .run();
  } else {
    // INSERT path — first interaction with this tour
    const id = `prog_${crypto.randomUUID().replace(/-/g, '')}`;
    await db.insert(userProgress).values({
      id,
      projectId,
      userId,
      tourId,
      status,
      completedAt,
      lastInteractionAt: now,
      lastCompletedStep: lastStep,
      statusHistory: JSON.stringify(history),
      updatedAt: now,
      createdAt: now,
    }).run();
  }

  return { success: true };
}


// ---------------------------------------------------------------------------
// GET /tours/active — fetch the active tour for a user on a specific route.
// [OPT-7] Now returns lastCompletedStep for server-side resume.
// ---------------------------------------------------------------------------
export async function fetchActiveTour(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.get('projectId');
  const contextKey = c.req.query('contextKey');
  const userId = c.req.query('userId');

  if (!contextKey || !userId) {
    return c.json({ error: 'Missing contextKey or userId' }, 400);
  }

  // [OPT-10] Projection — only fetch columns we need, skip stepsJson initially
  const targetTour = await db.select({
    id: tours.id,
    versionHash: tours.versionHash,
    stepsJson: tours.stepsJson,
    totalSteps: tours.totalSteps,
    uiVersion: tours.uiVersion,
  })
    .from(tours)
    .where(and(
      eq(tours.projectId, projectId),
      eq(tours.contextKey, contextKey),
      eq(tours.isActive, true)
    ))
    .orderBy(desc(tours.updatedAt))
    .get();

  if (!targetTour) {
    return c.json({ match: false, reason: 'No active tour found' }, 200);
  }

  // [AUTO-REGEN] If the host shipped a new UI version, the saved tour is stale →
  // report no-match so the SDK regenerates a fresh one (generate-sdk replaces it).
  const uiVersion = c.req.query('uiVersion');
  if (uiVersion && (targetTour.uiVersion ?? null) !== uiVersion) {
    return c.json({ match: false, reason: 'ui_version_changed' }, 200);
  }

  const existing = await db.select()
    .from(userProgress)
    .where(and(
      eq(userProgress.userId, userId),
      eq(userProgress.tourId, targetTour.id)
    ))
    .get();

  // completed / dismissed
  if (existing && ['completed', 'dismissed'].includes(existing.status)) {
    return c.json({ match: true, show: false, versionHash: targetTour.versionHash });
  }

  // maybe_later — resume karo steps ke saath (pehle check karo)
  if (existing && existing.status === 'maybe_later') {
    return c.json({
      match: true,
      show: true,
      tourId: targetTour.id,
      versionHash: targetTour.versionHash,
      steps: parseTourSteps(targetTour.stepsJson, targetTour.id),
      // [OPT-7] Server-side resume point
      lastCompletedStep: existing.lastCompletedStep ?? 0,
      hasProgress: true,
    }, 200);
  }

  const allSteps = parseTourSteps(targetTour.stepsJson, targetTour.id);

  // New user or mid-tour ('started') → full tour.
  // [OPT-1] Upsert — single row, no duplicates, state machine validated
  await upsertProgress(db, { projectId, userId, tourId: targetTour.id, status: 'started' });

  return c.json({
    match: true,
    show: true,
    tourId: targetTour.id,
    versionHash: targetTour.versionHash,
    steps: allSteps,
    lastCompletedStep: existing?.lastCompletedStep ?? 0,
    hasProgress: existing !== undefined && existing !== null,
    playMode: 'full',
  });
}


// ---------------------------------------------------------------------------
// POST /tours/progress — record a status change for a user's tour progress.
// [OPT-1] Upsert, [OPT-4] State machine, [OPT-9] Idempotency.
// ---------------------------------------------------------------------------
export async function recordTourProgress(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.get('projectId');
  const body = await c.req.json();
  const { userId, tourId, status, step } = body;

  // [OPT-3] Validate status against enum
  if (!userId || !tourId || !(VALID_STATUSES as readonly string[]).includes(status)) {
    return c.json({ error: 'Invalid progress payload' }, 400);
  }

  // BE-6: Verify tourId belongs to the calling project — prevents cross-project progress writes
  // [OPT-10] Projection — id + contextKey (the page, for the audit/request log)
  const tourOwnership = await db.select({ id: tours.id, contextKey: tours.contextKey })
    .from(tours)
    .where(and(eq(tours.id, tourId), eq(tours.projectId, projectId)))
    .get();

  if (!tourOwnership) {
    return c.json({ error: 'Tour not found or access denied' }, 403);
  }

  // Expose user + page to the request logger (they live in the body / the tour row,
  // not the query string) so request_logs isn't full of NULLs for this endpoint.
  c.set('auditUser', String(userId));
  if (tourOwnership.contextKey) c.set('auditContext', tourOwnership.contextKey);

  // [OPT-1/4/5/7/9] All optimizations handled inside upsertProgress
  const result = await upsertProgress(db, {
    projectId,
    userId,
    tourId,
    status: status as ValidStatus,
    step: typeof step === 'number' ? step : undefined,
  });

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  // [AUDIT] Trail of significant lifecycle events (complete / dismiss). 'started'
  // and idempotent replays are skipped — too noisy to be useful.
  if (!result.idempotent && (status === 'completed' || status === 'dismissed')) {
    const audit = writeAuditLog(db, {
      projectId,
      action: status === 'completed' ? 'complete' : 'dismiss',
      entity: 'tour',
      tourId,
      userId,
      ...(typeof step === 'number' ? { step } : {}),
    });
    if (c.executionCtx?.waitUntil) c.executionCtx.waitUntil(audit); else await audit;
  }

  return c.json({
    success: true,
    ...(result.idempotent ? { idempotent: true } : {}),
  }, 200);
}


// ---------------------------------------------------------------------------
// GET /tours/current — crawler endpoint (no auth, read-only).
// ---------------------------------------------------------------------------
export async function getCurrentTourForCrawler(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.req.query('projectId');
  const contextKey = c.req.query('contextKey');

  if (!projectId || !contextKey) {
    return c.json({ error: 'Missing projectId or contextKey' }, 400);
  }

  // [OPT-10] Projection — only fetch what crawler needs
  const tour = await db.select({
    id: tours.id,
    versionHash: tours.versionHash,
    elementFingerprints: tours.elementFingerprints,
  })
    .from(tours)
    .where(and(
      eq(tours.projectId, projectId),
      eq(tours.contextKey, contextKey),
      eq(tours.isActive, true)
    ))
    .orderBy(desc(tours.updatedAt))
    .get();

  if (!tour) return c.json(null, 200);

  return c.json({
    id: tour.id,
    versionHash: tour.versionHash,
    elementFingerprints: tour.elementFingerprints
  });
}