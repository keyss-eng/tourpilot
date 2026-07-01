// ---------------------------------------------------------------------------
// [BILLING] Subscription plans + MAU bill calculation. Plan config now lives in
// the DB (`plans` table) so prices/limits can change WITHOUT a redeploy. This
// module reads from there; the hardcoded DEFAULT_PLANS below is only a seed +
// resilience fallback (used if the table is empty/unreachable). All money is in
// the smallest currency unit (paise/cents): 100 = ₹1.00.
// ---------------------------------------------------------------------------
import type { getDb } from '../db';
import { plans } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface PlanConfig {
  name: string;
  limit: number | null;             // max active users (MAU); null = unlimited
  maxToursGenerated: number | null; // null = unlimited
  maxToursShown: number | null;     // null = unlimited
  price: number;                    // monthly price, USD cents
  priceYearly: number;              // yearly price, USD cents
  overagePerMau: number;
}

// Seed values — also the fallback if the DB table is empty/unreachable. USD cents.
export const DEFAULT_PLANS: PlanConfig[] = [
  { name: 'free',    limit: 1_000,  maxToursGenerated: 25,   maxToursShown: 10_000,  price: 0,    priceYearly: 0,     overagePerMau: 0 },
  { name: 'starter', limit: 10_000, maxToursGenerated: 100,  maxToursShown: 100_000, price: 1900, priceYearly: 19000, overagePerMau: 1 }, // $19 / $190
  { name: 'growth',  limit: 50_000, maxToursGenerated: 500,  maxToursShown: 500_000, price: 4900, priceYearly: 49000, overagePerMau: 1 }, // $49 / $490
  { name: 'pro',     limit: null,   maxToursGenerated: null, maxToursShown: null,    price: 9900, priceYearly: 99000, overagePerMau: 0 }, // $99 / $990
];

function fallbackPlan(name: string | null | undefined): PlanConfig {
  return (
    DEFAULT_PLANS.find((p) => p.name === name) ??
    DEFAULT_PLANS.find((p) => p.name === 'free')!
  );
}

// Load a plan config from the DB, falling back to the free plan (then to the
// hardcoded default) if the requested plan or the table is missing.
export async function getPlan(
  db: ReturnType<typeof getDb>,
  name: string | null | undefined
): Promise<PlanConfig> {
  try {
    const wanted = name || 'free';
    const toConfig = (r: typeof plans.$inferSelect): PlanConfig => ({
      name: r.name,
      limit: r.monthlyLimit ?? null,
      maxToursGenerated: r.maxToursGenerated ?? null,
      maxToursShown: r.maxToursShown ?? null,
      price: r.price,
      priceYearly: r.priceYearly,
      overagePerMau: r.overagePerMau,
    });
    const row = await db.select().from(plans).where(eq(plans.name, wanted)).get();
    if (row) return toConfig(row);
    const free = await db.select().from(plans).where(eq(plans.name, 'free')).get();
    if (free) return toConfig(free);
  } catch (err) {
    console.warn('[plans] DB read failed, using defaults:', err);
  }
  return fallbackPlan(name);
}

// Pure: compute the bill from an already-resolved plan config + MAU count.
export function calcBill(plan: PlanConfig, mau: number) {
  const limit = plan.limit;
  const extraMau = limit === null ? 0 : Math.max(0, mau - limit);
  const overage = extraMau * plan.overagePerMau;
  return {
    plan: plan.name,
    planLimit: limit, // null = unlimited
    baseFee: plan.price,
    overage,
    amountDue: plan.price + overage,
  };
}

// Current month as "YYYY-MM" (UTC).
export function currentMonth(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

// [start, end) Date range for a "YYYY-MM" month (UTC).
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}
