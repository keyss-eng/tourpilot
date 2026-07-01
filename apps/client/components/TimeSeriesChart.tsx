'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { useTimeseries } from '@/hooks/useDashboard';
import { num } from '@/lib/format';
import { cn } from '@/lib/cn';
import { AreaChart } from '@/components/AreaChart';
import type { TimeRange } from '@/types/api';

const RANGES: { id: TimeRange; label: string; sub: string }[] = [
  { id: 'hour', label: 'Hour', sub: 'last 24 hours' },
  { id: 'day', label: 'Daily', sub: 'last 30 days' },
  { id: 'week', label: 'Weekly', sub: 'last 12 weeks' },
  { id: 'month', label: 'Monthly', sub: 'last 12 months' },
];

export function TimeSeriesChart() {
  const [range, setRange] = useState<TimeRange>('day');
  const q = useTimeseries(range);
  const series = q.data?.series ?? [];
  const totalShown = series.reduce((a, s) => a + s.shown, 0);
  const totalSteps = series.reduce((a, s) => a + s.steps, 0);
  const active = RANGES.find((r) => r.id === range)!;

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Tours shown</h3>
          <p className="text-xs text-muted">
            {active.sub} · {num(totalShown)} shown · {num(totalSteps)} steps
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={cn(
                'rounded-md px-3 py-1 transition-colors',
                range === r.id ? 'bg-brand-600 text-white dark:bg-brand-500' : 'text-muted hover:text-text'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="h-56 animate-pulse rounded-lg bg-surface-2" />
      ) : series.every((s) => s.shown === 0) ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted">
          No tours shown in this period yet.
        </div>
      ) : (
        <AreaChart
          height={224}
          maxXLabels={range === 'hour' ? 6 : range === 'day' ? 6 : 12}
          format={(v) => num(Math.round(v))}
          points={series.map((s) => ({ label: s.label, value: s.shown }))}
        />
      )}
    </Card>
  );
}
