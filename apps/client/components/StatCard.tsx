import { cn } from '@/lib/cn';

export function StatCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** Accent the card (brand border + tint) — for the primary metric in a row. */
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-5 shadow-card transition-colors',
        highlight
          ? 'border-brand-200 bg-brand-50 dark:border-brand-600/40 dark:bg-brand-600/15'
          : 'border-border bg-surface hover:border-border'
      )}
    >
      <div
        className={cn(
          'text-xs font-semibold uppercase tracking-wider',
          highlight ? 'text-brand-700 dark:text-brand-200' : 'text-muted'
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'mt-2 text-4xl font-bold tabular-nums tracking-tight',
          highlight && 'text-brand-700 dark:text-brand-100'
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className={cn('mt-1.5 text-xs', highlight ? 'text-brand-600/80 dark:text-brand-300/80' : 'text-muted')}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
