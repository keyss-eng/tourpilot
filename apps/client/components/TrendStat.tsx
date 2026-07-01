import { cn } from '@/lib/cn';

// Stat card with an optional week-over-week delta chip.
export function TrendStat({
  label,
  value,
  deltaPct,
  hint,
}: {
  label: string;
  value: string | number;
  deltaPct?: number | null;
  hint?: string;
}) {
  const up = deltaPct != null && deltaPct >= 0;
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card transition-colors hover:border-border">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-2 text-4xl font-bold tabular-nums tracking-tight">{value}</div>
      <div className="mt-1.5 text-xs">
        {deltaPct != null ? (
          <span className={cn('inline-flex items-center gap-1', up ? 'text-success' : 'text-danger')}>
            <span>{up ? '↑' : '↓'}</span>
            {Math.abs(deltaPct)}% <span className="text-muted">vs last week</span>
          </span>
        ) : (
          <span className="text-muted">{hint ?? '—'}</span>
        )}
      </div>
    </div>
  );
}
