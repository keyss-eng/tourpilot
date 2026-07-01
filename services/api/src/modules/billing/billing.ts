import type { Context } from 'hono';
import { getDb } from '../../db';
import { tourCost, projects, plans as plansTable } from '../../db/schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { computeMauBill } from '../../services/mau';
import { currentMonth } from '../../services/plans';

// GET /plans — public pricing list (all subscription tiers), cheapest first.
// Used by the dashboard "Plans" section so clients can compare/choose a tier.
export async function listPublicPlans(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const rows = await db.select().from(plansTable).all();
  rows.sort((a, b) => a.price - b.price);
  return c.json({ plans: rows });
}

// ---------------------------------------------------------------------------
// GET /billing/usage — page-wise + total billing for a project.
//
// Pricing model is "per tour generated": every generation is one billable unit
// (its rate is snapshotted in tour_cost.billable_amount). This endpoint
// aggregates tour_cost into: how many tours, OUR provider cost, and the CLIENT
// charge — broken down per page.
//
// Access: the calling project's own data (authMiddleware sets projectId). An
// admin (X-Admin-Secret) may pass ?projectId= to inspect any project.
// ---------------------------------------------------------------------------
export async function getBillingUsage(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);

  const authedProjectId = c.get('projectId') as string | undefined;
  const adminSecret = c.req.header('X-Admin-Secret');
  const isAdmin = !!adminSecret && adminSecret === c.env.ADMIN_SECRET;
  const queryProjectId = c.req.query('projectId');

  // Non-admins are locked to their own project; admins may target any project.
  const projectId = isAdmin && queryProjectId ? queryProjectId : authedProjectId;
  if (!projectId) {
    return c.json({ error: 'Missing project context' }, 400);
  }

  // Optional ISO date range (?from=YYYY-MM-DD&to=YYYY-MM-DD).
  const fromRaw = c.req.query('from');
  const toRaw = c.req.query('to');
  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;

  const filters = [eq(tourCost.projectId, projectId)];
  if (from && !isNaN(from.getTime())) filters.push(gte(tourCost.createdAt, from));
  if (to && !isNaN(to.getTime())) filters.push(lte(tourCost.createdAt, to));

  // ── Per page (contextKey) ────────────────────────────────────────────────
  const byPage = await db.select({
    contextKey: tourCost.contextKey,
    tours: sql<number>`count(*)`,
    providerCostMicroUsd: sql<number>`coalesce(sum(${tourCost.providerCostMicroUsd}), 0)`,
    billableAmount: sql<number>`coalesce(sum(${tourCost.billableAmount}), 0)`,
  })
    .from(tourCost)
    .where(and(...filters))
    .groupBy(tourCost.contextKey)
    .all();

  // ── Totals ───────────────────────────────────────────────────────────────
  const totals = byPage.reduce(
    (acc, r) => {
      acc.tours += Number(r.tours);
      acc.providerCostMicroUsd += Number(r.providerCostMicroUsd);
      acc.billableAmount += Number(r.billableAmount);
      return acc;
    },
    { tours: 0, providerCostMicroUsd: 0, billableAmount: 0 }
  );

  return c.json({
    projectId,
    range: { from: fromRaw ?? null, to: toRaw ?? null },
    totals: {
      toursGenerated: totals.tours,
      providerCostMicroUsd: totals.providerCostMicroUsd, // OUR cost (1e-6 USD)
      billableAmount: totals.billableAmount,             // CLIENT charge (smallest unit)
    },
    pages: byPage,
  });
}

// GET /billing/mau?month=YYYY-MM  → MAU-based subscription bill for a project.
// Computes distinct active users for the month + applies the plan. Default month
// = current. Admin (X-Admin-Secret) may pass ?projectId= to inspect any project.
export async function getMauBilling(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);

  const authedProjectId = c.get('projectId') as string | undefined;
  const adminSecret = c.req.header('X-Admin-Secret');
  const isAdmin = !!adminSecret && adminSecret === c.env.ADMIN_SECRET;
  const projectId = isAdmin && c.req.query('projectId') ? c.req.query('projectId')! : authedProjectId;
  if (!projectId) return c.json({ error: 'Missing project context' }, 400);

  const month = c.req.query('month') || currentMonth();

  const proj = await db.select({ plan: projects.plan })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();

  const bill = await computeMauBill(db, projectId, month, proj?.plan);
  return c.json({ projectId, ...bill });
}
