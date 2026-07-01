import { getDb } from '../db';
import { analytics, projects, mauMonthly } from '../db/schema';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { calcBill, currentMonth, monthRange, getPlan } from './plans';

// ---------------------------------------------------------------------------
// [BILLING] MAU = COUNT(DISTINCT user_id) in `analytics` for a project + month.
// Returns the full bill (mau + plan + base + overage + amount due).
// ---------------------------------------------------------------------------
export async function computeMauBill(
  db: ReturnType<typeof getDb>,
  projectId: string,
  month: string,
  planName: string | null | undefined
) {
  const { start, end } = monthRange(month);
  const row = await db.select({ n: sql<number>`count(distinct ${analytics.userId})` })
    .from(analytics)
    .where(and(
      eq(analytics.projectId, projectId),
      gte(analytics.timestamp, start),
      lt(analytics.timestamp, end)
    ))
    .get();

  const mau = row?.n ?? 0;
  const plan = await getPlan(db, planName);
  return { month, mau, ...calcBill(plan, mau) };
}

// Daily cron: upsert the CURRENT month's MAU snapshot for every project, so the
// billing number is permanent before analytics retention deletes the raw rows.
export async function snapshotMonthlyMau(env: any): Promise<void> {
  const db = getDb(env.aitour_db_Vishal);
  const month = currentMonth();

  const projs = await db.select({ id: projects.id, plan: projects.plan }).from(projects).all();
  for (const p of projs) {
    try {
      const b = await computeMauBill(db, p.id, month, p.plan);
      await db.insert(mauMonthly).values({
        id: `mau_${crypto.randomUUID().replace(/-/g, '')}`,
        projectId: p.id,
        month,
        mau: b.mau,
        plan: b.plan,
        baseFee: b.baseFee,
        overage: b.overage,
        amountDue: b.amountDue,
        createdAt: new Date(),
      }).onConflictDoUpdate({
        target: [mauMonthly.projectId, mauMonthly.month],
        set: { mau: b.mau, plan: b.plan, baseFee: b.baseFee, overage: b.overage, amountDue: b.amountDue },
      }).run();
    } catch (err) {
      console.error('[MAU] snapshot failed for', p.id, err);
    }
  }
  console.log(`[MAU] snapshotted ${projs.length} project(s) for ${month}`);
}
