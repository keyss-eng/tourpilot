import type { Context, Next } from 'hono';
import { getDb } from '../../db';
import { projects, accounts, tours, tourCost, plans, analytics, auditLog } from '../../db/schema';
import { eq, and, gte, lt, like, sql, desc } from 'drizzle-orm';
import { verifyJwt } from '../../services/auth-tokens';
import { computeMauBill } from '../../services/mau';
import { currentMonth, monthRange, getPlan } from '../../services/plans';
import { writeAuditLog } from '../../services/audit';

// ---------------------------------------------------------------------------
// Admin portal — CROSS-PROJECT endpoints (the SaaS owner's view of every
// client). Distinct from the per-project /admin/* dashboard endpoints, which
// are API-key scoped. Access here requires EITHER an admin-role dashboard JWT
// OR the X-Admin-Secret header.
// ---------------------------------------------------------------------------
function adminJwtSecret(c: Context): string {
  return c.env.AUTH_JWT_SECRET || c.env.ADMIN_SECRET || 'dev-insecure-secret';
}

export async function adminAuth(c: Context, next: Next) {
  // Path 1: X-Admin-Secret header (machine / owner CLI).
  const secret = c.req.header('X-Admin-Secret');
  if (secret && secret === c.env.ADMIN_SECRET) return next();

  // Path 2: dashboard JWT with role === 'admin'.
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) {
    const claims = await verifyJwt(header.slice(7), adminJwtSecret(c));
    if (claims?.role === 'admin') {
      c.set('account', claims);
      return next();
    }
  }
  return c.json({ error: 'Forbidden — admin only' }, 403);
}

// GET /admin/projects?from=YYYY-MM-DD&to=YYYY-MM-DD
// User-centric economics. Usage (tours, tokens, AI cost) is scoped to the date
// range (default: last 30 days). Revenue = each client's monthly plan price
// (recurring). Profit = revenue − AI token cost.
export async function listProjects(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);

  const now = Date.now();
  const toRaw = c.req.query('to');
  const fromRaw = c.req.query('from');
  const end = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : new Date();
  const start = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : new Date(now - 30 * 86400000);

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      plan: projects.plan,
      allowedOrigins: projects.allowedOrigins,
      blocked: projects.blocked,
      createdAt: projects.createdAt,
      email: accounts.email,
    })
    .from(projects)
    .leftJoin(accounts, eq(accounts.projectId, projects.id))
    .all();

  // Tours generated + token cost (our AI spend) per project, within the month.
  const costAgg = await db
    .select({
      projectId: tourCost.projectId,
      tours: sql<number>`count(*)`,
      tokenCost: sql<number>`coalesce(sum(${tourCost.providerCostMicroUsd}), 0)`,
      tokens: sql<number>`coalesce(sum(${tourCost.inputTokens} + ${tourCost.outputTokens}), 0)`,
    })
    .from(tourCost)
    .where(and(gte(tourCost.createdAt, start), lt(tourCost.createdAt, end)))
    .groupBy(tourCost.projectId)
    .all();
  const costMap = new Map(costAgg.map((r) => [r.projectId, r]));

  // Tours shown (impressions) per project, within the month.
  const shownAgg = await db
    .select({
      projectId: tours.projectId,
      shown: sql<number>`sum(case when ${analytics.eventType} = 'impression' then 1 else 0 end)`,
    })
    .from(analytics)
    .innerJoin(tours, eq(analytics.tourId, tours.id))
    .where(and(gte(analytics.timestamp, start), lt(analytics.timestamp, end)))
    .groupBy(tours.projectId)
    .all();
  const shownMap = new Map(shownAgg.map((r) => [r.projectId, Number(r.shown ?? 0)]));

  // Active users (distinct user_id) per project within the range.
  const mauAgg = await db
    .select({
      projectId: analytics.projectId,
      users: sql<number>`count(distinct ${analytics.userId})`,
    })
    .from(analytics)
    .where(and(gte(analytics.timestamp, start), lt(analytics.timestamp, end)))
    .groupBy(analytics.projectId)
    .all();
  const mauMap = new Map(mauAgg.map((r) => [r.projectId, Number(r.users ?? 0)]));

  // Per-client economics. Revenue = the client's monthly plan price (recurring);
  // tokenCost = our AI spend (micro-USD → cents); profit = revenue − tokenCost.
  const microToCents = (micro: number) => Math.round(micro / 10000);
  const out = [];
  let totRevenue = 0, totTokenCents = 0, totTours = 0, totShown = 0, totTokens = 0;
  for (const r of rows) {
    const planCfg = await getPlan(db, r.plan);
    const cost = costMap.get(r.id);
    const tokenMicro = Number(cost?.tokenCost ?? 0);
    const tokenCents = microToCents(tokenMicro);
    const tokens = Number(cost?.tokens ?? 0);
    const revenue = planCfg.price;         // monthly plan price, USD cents
    const shown = shownMap.get(r.id) ?? 0;
    const toursGen = Number(cost?.tours ?? 0);

    totRevenue += revenue; totTokenCents += tokenCents; totTours += toursGen; totShown += shown; totTokens += tokens;
    out.push({
      id: r.id,
      name: r.name,
      email: r.email,
      plan: r.plan,
      blocked: r.blocked,
      allowedOrigins: r.allowedOrigins,
      createdAt: r.createdAt,
      mau: mauMap.get(r.id) ?? 0,
      revenue,                              // monthly plan price (cents)
      tokensUsed: tokens,                   // AI tokens consumed (input + output)
      tokenCostMicroUsd: tokenMicro,        // our AI spend (micro-USD)
      tokenCostCents: tokenCents,
      profit: revenue - tokenCents,         // cents
      toursGenerated: toursGen,
      toursShown: shown,
    });
  }

  return c.json({
    range: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
    totals: {
      clients: rows.length,
      revenue: totRevenue,
      tokensUsed: totTokens,
      tokenCostCents: totTokenCents,
      profit: totRevenue - totTokenCents,
      toursGenerated: totTours,
      toursShown: totShown,
    },
    projects: out,
  });
}

// GET /admin/economics-series?from&to — platform-wide daily series for charts:
// AI token cost, tokens used, tours generated, tours shown.
export async function getEconomicsSeries(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const now = Date.now();
  const toRaw = c.req.query('to');
  const fromRaw = c.req.query('from');
  const end = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : new Date();
  const start = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : new Date(now - 30 * 86400000);

  const costRows = await db.select({
    d: sql<string>`date(${tourCost.createdAt})`,
    cost: sql<number>`coalesce(sum(${tourCost.providerCostMicroUsd}), 0)`,
    tokens: sql<number>`coalesce(sum(${tourCost.inputTokens} + ${tourCost.outputTokens}), 0)`,
    tours: sql<number>`count(*)`,
  })
    .from(tourCost)
    .where(and(gte(tourCost.createdAt, start), lt(tourCost.createdAt, end)))
    .groupBy(sql`date(${tourCost.createdAt})`)
    .all();
  const costMap = new Map(costRows.map((r) => [r.d, r]));

  const shownRows = await db.select({
    d: sql<string>`date(${analytics.timestamp})`,
    shown: sql<number>`sum(case when ${analytics.eventType} = 'impression' then 1 else 0 end)`,
  })
    .from(analytics)
    .where(and(gte(analytics.timestamp, start), lt(analytics.timestamp, end)))
    .groupBy(sql`date(${analytics.timestamp})`)
    .all();
  const shownMap = new Map(shownRows.map((r) => [r.d, Number(r.shown ?? 0)]));

  const series: { date: string; costCents: number; tokens: number; tours: number; shown: number }[] = [];
  const dayMs = 86400000;
  const startDay = new Date(start.toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  const endDay = new Date(end.toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  for (let t = startDay; t <= endDay; t += dayMs) {
    const key = new Date(t).toISOString().slice(0, 10);
    const cr = costMap.get(key);
    series.push({
      date: key,
      costCents: Math.round(Number(cr?.cost ?? 0) / 10000),
      tokens: Number(cr?.tokens ?? 0),
      tours: Number(cr?.tours ?? 0),
      shown: shownMap.get(key) ?? 0,
    });
  }
  return c.json({ series });
}

// POST /admin/block  { projectId, blocked } — suspend / un-suspend a client.
export async function setProjectBlocked(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const body = await c.req.json().catch(() => ({}));
  const projectId = String(body.projectId || '');
  const blocked = !!body.blocked;
  if (!projectId) return c.json({ error: 'projectId is required' }, 400);

  await db.update(projects).set({ blocked }).where(eq(projects.id, projectId)).run();
  await writeAuditLog(db, { projectId, action: blocked ? 'blocked' : 'unblocked', entity: 'account' });
  return c.json({ success: true, projectId, blocked });
}

// GET /admin/projects/:id — one project's detail (numbers + bill).
export async function getProjectDetail(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Missing project id' }, 400);

  const proj = await db.select().from(projects).where(eq(projects.id, id)).get();
  if (!proj) return c.json({ error: 'Project not found' }, 404);

  const owner = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.projectId, id)).get();

  const pagesRow = await db
    .select({ n: sql<number>`count(distinct ${tours.contextKey})` })
    .from(tours)
    .where(eq(tours.projectId, id))
    .get();

  const costRow = await db
    .select({
      tours: sql<number>`count(*)`,
      billable: sql<number>`coalesce(sum(${tourCost.billableAmount}), 0)`,
      cost: sql<number>`coalesce(sum(${tourCost.providerCostMicroUsd}), 0)`,
    })
    .from(tourCost)
    .where(eq(tourCost.projectId, id))
    .get();

  const bill = await computeMauBill(db, id, currentMonth(), proj.plan);

  return c.json({
    id: proj.id,
    name: proj.name,
    email: owner?.email ?? null,
    plan: proj.plan,
    allowedOrigins: proj.allowedOrigins,
    createdAt: proj.createdAt,
    pagesWithTours: pagesRow?.n ?? 0,
    toursGenerated: costRow?.tours ?? 0,
    revenue: costRow?.billable ?? 0,
    providerCostMicroUsd: costRow?.cost ?? 0,
    bill,
  });
}

// GET /admin/projects/:id/pages — per-page table for ANY project (same shape as
// the client's /admin/pages, but admin-scoped by the :id param).
export async function getProjectPages(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.req.param('id');
  if (!projectId) return c.json({ error: 'Missing project id' }, 400);

  // Same range model as the client's Pages screen (hour/day/week/month).
  const range = (c.req.query('range') || 'day') as 'hour' | 'day' | 'week' | 'month';
  const ms = range === 'hour' ? 24 * 3600 * 1000
    : range === 'week' ? 84 * 86400000
    : range === 'month' ? 365 * 86400000
    : 30 * 86400000;
  const since = new Date(Date.now() - ms);

  const gens = await db.select({
    contextKey: tourCost.contextKey,
    generations: sql<number>`count(*)`,
  })
    .from(tourCost)
    .where(and(eq(tourCost.projectId, projectId), gte(tourCost.createdAt, since)))
    .groupBy(tourCost.contextKey)
    .all();

  const stats = await db.select({
    contextKey: tours.contextKey,
    shown: sql<number>`sum(case when ${analytics.eventType} = 'impression' then 1 else 0 end)`,
  })
    .from(analytics)
    .innerJoin(tours, eq(analytics.tourId, tours.id))
    .where(and(eq(tours.projectId, projectId), gte(analytics.timestamp, since)))
    .groupBy(tours.contextKey)
    .all();

  const map = new Map<string, { contextKey: string; generations: number; shown: number }>();
  for (const g of gens) map.set(g.contextKey, { contextKey: g.contextKey, generations: g.generations ?? 0, shown: 0 });
  for (const s of stats) {
    const e = map.get(s.contextKey) ?? { contextKey: s.contextKey, generations: 0, shown: 0 };
    e.shown = s.shown ?? 0;
    map.set(s.contextKey, e);
  }

  return c.json({ range, pages: [...map.values()] });
}

// GET /admin/projects/:id/events — client ACCOUNT activity for ANY project
// (login / logout / signup / plan_change), matching the client's Activity screen.
export async function getProjectEvents(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.req.param('id');
  if (!projectId) return c.json({ error: 'Missing project id' }, 400);
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);

  const rows = await db.select()
    .from(auditLog)
    .where(and(eq(auditLog.projectId, projectId), like(auditLog.log, '%"entity":"account"%')))
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

// POST /admin/plan  { projectId, plan } — change a client's subscription tier.
export async function setProjectPlan(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const body = await c.req.json().catch(() => ({}));
  const projectId = String(body.projectId || '');
  const plan = String(body.plan || '');
  if (!projectId || !plan) return c.json({ error: 'projectId and plan are required' }, 400);

  // Validate the plan exists in the plans table.
  const resolved = await getPlan(db, plan);
  if (resolved.name !== plan) return c.json({ error: `Unknown plan "${plan}"` }, 400);

  const proj = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get();
  if (!proj) return c.json({ error: 'Project not found' }, 404);

  await db.update(projects).set({ plan }).where(eq(projects.id, projectId)).run();
  await writeAuditLog(db, { projectId, action: 'plan_change', entity: 'account', plan });
  return c.json({ success: true, projectId, plan });
}

// GET /admin/plans — list all subscription tiers (for the plan dropdown).
export async function listPlans(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const rows = await db.select().from(plans).all();
  return c.json({ plans: rows });
}
