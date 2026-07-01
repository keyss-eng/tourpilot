import { Card } from '@/components/ui/Card';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Lightweight 7-day bar chart (no chart lib). Tallest bar accented.
export function MiniChart({ series }: { series: { date: string; users: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.users));
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium">Active users · last 7 days</h3>
        <span className="text-xs text-muted">daily</span>
      </div>
      <div className="flex h-28 items-end gap-2.5">
        {series.map((s) => {
          const h = Math.round((s.users / max) * 100);
          const peak = s.users === max && max > 0;
          const label = DOW[new Date(s.date + 'T00:00:00').getDay()];
          return (
            <div key={s.date} className="flex flex-1 flex-col items-center gap-1.5" title={`${s.date}: ${s.users}`}>
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t-md ${peak ? 'bg-primary' : 'bg-primary/35'}`}
                  style={{ height: `${Math.max(h, 4)}%` }}
                />
              </div>
              <span className="text-[11px] text-muted">{label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
