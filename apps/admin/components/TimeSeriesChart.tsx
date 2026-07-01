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
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Tours shown</h3>
          <p className="text-xs text-muted">
            {active.sub} · {num(totalShown)} shown · {num(totalSteps)} steps
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-bg p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                range === r.id ? 'bg-primary/15 text-text' : 'text-muted hover:text-text'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="h-44 animate-pulse rounded-lg bg-surface-2" />
      ) : series.every((s) => s.shown === 0) ? (
        <div className="flex h-44 items-center justify-center text-sm text-muted">
          No tours shown in this period yet.
        </div>
      ) : (
        <AreaChart
          height={176}
          maxXLabels={range === 'hour' ? 6 : range === 'day' ? 6 : 12}
          format={(v) => num(Math.round(v))}
          points={series.map((s) => ({ label: s.label, value: s.shown }))}
        />
      )}
    </Card>
  );
}
