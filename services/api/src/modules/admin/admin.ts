import type { Context } from 'hono';
import { getDb } from '../../db';
import { tours, analytics, auditLog, tourCost } from '../../db/schema';
import { eq, and, gte, lt, desc, like, sql } from 'drizzle-orm';
import { snapshotMonthlyMau } from '../../services/mau';

// ---------------------------------------------------------------------------
// Admin dashboard endpoints. Scoped to the calling project via authMiddleware
// (projectId comes from the API key — same pattern as /billing/usage). All data
// is read from tables the SDK already populates (analytics, tour_generations,
// audit_log, tours). The destructive /tours/regenerate additionally requires the
// X-Admin-Secret header.
// ---------------------------------------------------------------------------

function sevenDaysAgo(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

// GET /admin/overview  → top-line numbers for the dashboard header.
export async function getAdminOverview(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.get('projectId');
  if (!projectId) return c.json({ error: 'Missing projectId' }, 400);

  const since = sevenDaysAgo();

  // Tours total (pages with an active tour) + total steps across those tours.
  const pagesRow = await db.select({
    n: sql<number>`count(distinct ${tours.contextKey})`,
    steps: sql<number>`coalesce(sum(${tours.totalSteps}), 0)`,
  })
    .from(tours)
    .where(and(eq(tours.projectId, projectId), eq(tours.isActive, true)))
    .get();

  // Total step-tooltips shown in the last 7 days ('step_view' events).
  const stepsShownRow = await db.select({ n: sql<number>`count(*)` })
    .from(analytics)
    .where(and(
      eq(analytics.projectId, projectId),
      eq(analytics.eventType, 'step_view'),
      gte(analytics.timestamp, since)
    ))
    .get();

  const genRow = await db.select({
    count: sql<number>`count(*)`,
    billable: sql<number>`coalesce(sum(${tourCost.billableAmount}), 0)`,
    cost: sql<number>`coalesce(sum(${tourCost.providerCostMicroUsd}), 0)`,
  })
    .from(tourCost)
    .where(eq(tourCost.projectId, projectId))
    .get();

  const shownRow = await db.select({ n: sql<number>`count(*)` })
    .from(analytics)
    .where(and(
      eq(analytics.projectId, projectId),
      eq(analytics.eventType, 'impression'),
      gte(analytics.timestamp, since)
    ))
    .get();

  const completedRow = await db.select({ n: sql<number>`count(*)` })
    .from(analytics)
    .where(and(
      eq(analytics.projectId, projectId),
      eq(analytics.eventType, 'complete'),
      gte(analytics.timestamp, since)
    ))
    .get();

  const shown = shownRow?.n ?? 0;
  const completed = completedRow?.n ?? 0;

  // ── Trends ────────────────────────────────────────────────────────────────
  // This-week vs previous-week deltas + a 7-day daily active-users series for
  // the sparkline. "Active user" = a distinct user_id seen that day.
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const usersThisWeek = await db.select({ n: sql<number>`count(distinct ${analytics.userId})` })
    .from(analytics)
    .where(and(eq(analytics.projectId, projectId), gte(analytics.timestamp, since)))
    .get();

  const usersPrevWeek = await db.select({ n: sql<number>`count(distinct ${analytics.userId})` })
    .from(analytics)
    .where(and(
      eq(analytics.projectId, projectId),
      gte(analytics.timestamp, since14),
      lt(analytics.timestamp, since)
    ))
    .get();

  const shownPrevWeek = await db.select({ n: sql<number>`count(*)` })
    .from(analytics)
    .where(and(
      eq(analytics.projectId, projectId),
      eq(analytics.eventType, 'impression'),
      gte(analytics.timestamp, since14),
      lt(analytics.timestamp, since)
    ))
    .get();

  // Distinct active users per calendar day (last 7 days).
  const dailyRows = await db.select({
    d: sql<string>`date(${analytics.timestamp})`,
    n: sql<number>`count(distinct ${analytics.userId})`,
  })
    .from(analytics)
    .where(and(eq(analytics.projectId, projectId), gte(analytics.timestamp, since)))
    .groupBy(sql`date(${analytics.timestamp})`)
    .all();

  const dayMap = new Map(dailyRows.map((r) => [r.d, Number(r.n)]));
  const series: { date: string; users: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    series.push({ date: day, users: dayMap.get(day) ?? 0 });
  }

  const pctDelta = (now: number, prev: number): number | null =>
    prev > 0 ? Math.round(((now - prev) / prev) * 100) : null;

  const uNow = usersThisWeek?.n ?? 0;
  const uPrev = usersPrevWeek?.n ?? 0;

  return c.json({
    pagesWithTours: pagesRow?.n ?? 0,            // number of pages with a tour (= "tours")
    totalSteps: pagesRow?.steps ?? 0,            // total steps across all active tours
    toursShownWeek: shown,                       // tours shown (impressions), last 7d
    stepsShownWeek: stepsShownRow?.n ?? 0,       // step-tooltips shown, last 7d
    completionRate: shown > 0 ? Math.round((completed / shown) * 100) : 0,
    toursGenerated: genRow?.count ?? 0,
    billableAmount: genRow?.billable ?? 0,       // client charge (smallest currency unit)
    providerCostMicroUsd: genRow?.cost ?? 0,     // our cost (micro-USD)
    trend: {
      activeUsersWeek: uNow,
      activeUsersDeltaPct: pctDelta(uNow, uPrev),
      shownDeltaPct: pctDelta(shown, shownPrevWeek?.n ?? 0),
      series, // [{ date, users }] last 7 days ascending
    },
  });
}

// GET /admin/timeseries?range=hour|day|week|month
// Tours-shown (impressions) + steps-shown over time, bucketed by the range:
//   hour  → last 24 hours (per hour)
//   day   → last 30 days  (per day)
//   week  → last 12 weeks (per week)
//   month → last 12 months(per month)
export async function getTimeseries(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.get('projectId');
  if (!projectId) return c.json({ error: 'Missing projectId' }, 400);

  const range = (c.req.query('range') || 'day') as 'hour' | 'day' | 'week' | 'month';
  const now = Date.now();
  const shownExpr = sql<number>`sum(case when ${analytics.eventType} = 'impression' then 1 else 0 end)`;
  const stepsExpr = sql<number>`sum(case when ${analytics.eventType} = 'step_view' then 1 else 0 end)`;

  // ── Hour: 24 hourly buckets ───────────────────────────────────────────────
  if (range === 'hour') {
    const since = new Date(now - 24 * 3600 * 1000);
    const rows = await db.select({
      b: sql<string>`strftime('%Y-%m-%dT%H', ${analytics.timestamp})`,
      shown: shownExpr,
      steps: stepsExpr,
    })
      .from(analytics)
      .where(and(eq(analytics.projectId, projectId), gte(analytics.timestamp, since)))
      .groupBy(sql`strftime('%Y-%m-%dT%H', ${analytics.timestamp})`)
      .all();
    const map = new Map(rows.map((r) => [r.b, r]));
    const series = [];
    for (let i = 23; i >= 0; i--) {
      const key = new Date(now - i * 3600 * 1000).toISOString().slice(0, 13);
      const r = map.get(key);
      series.push({ label: `${key.slice(11)}:00`, shown: Number(r?.shown ?? 0), steps: Number(r?.steps ?? 0) });
    }
    return c.json({ range, series });
  }

  // ── Day / Week / Month: query per-day, then bucket in JS ──────────────────
  const lookbackDays = range === 'month' ? 365 : range === 'week' ? 84 : 30;
  const since = new Date(now - lookbackDays * 86400000);
  const rows = await db.select({
    b: sql<string>`date(${analytics.timestamp})`,
    shown: shownExpr,
    steps: stepsExpr,
  })
    .from(analytics)
    .where(and(eq(analytics.projectId, projectId), gte(analytics.timestamp, since)))
    .groupBy(sql`date(${analytics.timestamp})`)
    .all();
  const map = new Map(rows.map((r) => [r.b, { shown: Number(r.shown ?? 0), steps: Number(r.steps ?? 0) }]));

  const series: { label: string; shown: number; steps: number }[] = [];

  if (range === 'day') {
    for (let i = 29; i >= 0; i--) {
      const key = new Date(now - i * 86400000).toISOString().slice(0, 10);
      const r = map.get(key);
      series.push({ label: key.slice(5), shown: r?.shown ?? 0, steps: r?.steps ?? 0 });
    }
  } else if (range === 'week') {
    for (let w = 11; w >= 0; w--) {
      let shown = 0, steps = 0;
      for (let d = 0; d < 7; d++) {
        const key = new Date(now - (w * 7 + d) * 86400000).toISOString().slice(0, 10);
        const r = map.get(key);
        if (r) { shown += r.shown; steps += r.steps; }
      }
      const wkStart = new Date(now - (w * 7 + 6) * 86400000).toISOString().slice(5, 10);
      series.push({ label: wkStart, shown, steps });
    }
  } else {
    // month — group the daily rows by YYYY-MM
    for (let m = 11; m >= 0; m--) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      const ym = d.toISOString().slice(0, 7);
      let shown = 0, steps = 0;
      for (const [k, r] of map) {
        if (k.slice(0, 7) === ym) { shown += r.shown; steps += r.steps; }
      }
      series.push({ label: ym, shown, steps });
    }
  }

  return c.json({ range, series });
}

// GET /admin/pages  → per-page table (generated / cost / shown / completion).
export async function getAdminPages(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.get('projectId');
  if (!projectId) return c.json({ error: 'Missing projectId' }, 400);

  // Time window (matches the overview graph ranges).
  const range = (c.req.query('range') || 'day') as 'hour' | 'day' | 'week' | 'month';
  const ms = range === 'hour' ? 24 * 3600 * 1000
    : range === 'week' ? 84 * 86400000
    : range === 'month' ? 365 * 86400000
    : 30 * 86400000; // day
  const since = new Date(Date.now() - ms);

  // Generations per page within the window.
  const gens = await db.select({
    contextKey: tourCost.contextKey,
    generations: sql<number>`count(*)`,
    billable: sql<number>`coalesce(sum(${tourCost.billableAmount}), 0)`,
  })
    .from(tourCost)
    .where(and(eq(tourCost.projectId, projectId), gte(tourCost.createdAt, since)))
    .groupBy(tourCost.contextKey)
    .all();

  // Shown / completed per page within the window — analytics joined to its tour.
  const stats = await db.select({
    contextKey: tours.contextKey,
    shown: sql<number>`sum(case when ${analytics.eventType} = 'impression' then 1 else 0 end)`,
    completed: sql<number>`sum(case when ${analytics.eventType} = 'complete' then 1 else 0 end)`,
  })
    .from(analytics)
    .innerJoin(tours, eq(analytics.tourId, tours.id))
    .where(and(eq(tours.projectId, projectId), gte(analytics.timestamp, since)))
    .groupBy(tours.contextKey)
    .all();

  const map = new Map<string, { contextKey: string; generations: number; billable: number; shown: number; completed: number }>();
  for (const g of gens) {
    map.set(g.contextKey, { contextKey: g.contextKey, generations: g.generations ?? 0, billable: g.billable ?? 0, shown: 0, completed: 0 });
  }
  for (const s of stats) {
    const e = map.get(s.contextKey) ?? { contextKey: s.contextKey, generations: 0, billable: 0, shown: 0, completed: 0 };
    e.shown = s.shown ?? 0;
    e.completed = s.completed ?? 0;
    map.set(s.contextKey, e);
  }

  const pages = [...map.values()].map(p => ({
    ...p,
    completionRate: p.shown > 0 ? Math.round((p.completed / p.shown) * 100) : 0,
  }));

  return c.json({ range, pages });
}

// GET /admin/events  → recent CLIENT activity for the dashboard feed. Only
// account-level actions (login / logout / signup / plan_change) are returned —
// end-user tour interactions (generate/complete/dismiss) are intentionally
// excluded as they're noise for the client.
export async function getAdminEvents(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.get('projectId');
  if (!projectId) return c.json({ error: 'Missing projectId' }, 400);

  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);

  const rows = await db.select()
    .from(auditLog)
    .where(and(
      eq(auditLog.projectId, projectId),
      like(auditLog.log, '%"entity":"account"%'),
    ))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .all();

  const events = rows.map((r: any) => {
    let log: any = {};
    try { log = JSON.parse(r.log || '{}'); } catch { /* keep {} */ }
    return { id: r.id, at: r.createdAt, ...log };
  });

  return c.json({ events });
}


// POST /admin/snapshot-mau  → manually run the MAU snapshot (same as the daily
// cron) so mau_monthly is populated on demand (handy for testing). Admin only.
export async function triggerMauSnapshot(c: Context) {
  const secret = c.req.header('X-Admin-Secret');
  if (!secret || secret !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'Forbidden — admin secret required' }, 403);
  }
  await snapshotMonthlyMau(c.env);
  return c.json({ success: true, message: 'MAU snapshot written to mau_monthly' });
}

// POST /tours/regenerate  { contextKey } | { all: true }
// Deletes the saved tour(s) for a page so the next visitor regenerates a fresh
// one (used when the client ships a UI change). Cascades to user_progress.
// projectId comes from the API key; the destructive action additionally requires
// the X-Admin-Secret header so a leaked public SDK key alone can't wipe tours.
export async function regenerateTour(c: Context) {
  const secret = c.req.header('X-Admin-Secret');
  if (!secret || secret !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'Forbidden — admin secret required' }, 403);
  }

  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.get('projectId');
  if (!projectId) return c.json({ error: 'Missing projectId' }, 400);

  const body = await c.req.json().catch(() => ({}));

  if (body.all === true) {
    await db.delete(tours).where(eq(tours.projectId, projectId)).run();
    return c.json({ success: true, scope: 'all' });
  }

  if (!body.contextKey) return c.json({ error: 'Missing contextKey (or pass all:true)' }, 400);

  await db.delete(tours)
    .where(and(eq(tours.projectId, projectId), eq(tours.contextKey, body.contextKey)))
    .run();

  return c.json({ success: true, contextKey: body.contextKey });
}
