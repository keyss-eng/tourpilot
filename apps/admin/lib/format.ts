// All money is stored in the smallest USD unit (cents): 100 = $1.00.
export function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Approx USD→INR — only used to express our provider cost (micro-USD) in the
// admin profitability view alongside other figures.
export const USD_INR = 83.5;

export function pct(value: number): string {
  return `${value}%`;
}

// micro-USD (1,000,000 = $1) → readable USD string, e.g. 147 → "$0.000147".
// Trims trailing zeros but keeps small values precise.
export function usdFromMicro(micro: number): string {
  if (!micro) return '$0.00';
  const v = micro / 1_000_000;
  const s = v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return `$${s}`;
}

// micro-USD → INR in the smallest unit (paise), so it sits in the same unit as
// billable_amount and money() can format it.
export function microUsdToPaise(micro: number): number {
  return Math.round((micro / 1_000_000) * USD_INR * 100);
}

export function num(value: number): string {
  return value.toLocaleString('en-IN');
}

export function timeAgo(iso: string | number | Date): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
