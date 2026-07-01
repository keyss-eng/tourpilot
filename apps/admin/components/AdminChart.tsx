'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { useEconomicsSeries, type EconPoint } from '@/hooks/useAdmin';
import { money, num } from '@/lib/format';
import { cn } from '@/lib/cn';
import { AreaChart } from '@/components/AreaChart';

type Metric = 'costCents' | 'tokens' | 'tours' | 'shown';

const METRICS: { id: Metric; label: string }[] = [
  { id: 'costCents', label: 'AI cost' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'tours', label: 'Tours' },
  { id: 'shown', label: 'Shown' },
];

function fmt(metric: Metric, v: number): string {
  return metric === 'costCents' ? money(v) : num(v);
}

export function AdminChart({ from, to }: { from: string; to: string }) {
  const [metric, setMetric] = useState<Metric>('costCents');
  const q = useEconomicsSeries(from, to);
  const series: EconPoint[] = q.data ?? [];
  const total = series.reduce((a, s) => a + s[metric], 0);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Trends</h3>
          <p className="text-xs text-muted">Total {fmt(metric, total)} over the period</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-bg p-1">
          {METRICS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                metric === m.id ? 'bg-primary/15 text-text' : 'text-muted hover:text-text'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="h-44 animate-pulse rounded-lg bg-surface-2" />
      ) : series.every((s) => s[metric] === 0) ? (
        <div className="flex h-44 items-center justify-center text-sm text-muted">No data in this period yet.</div>
      ) : (
        <AreaChart
          height={176}
          maxXLabels={12}
          format={(v) => fmt(metric, Math.round(v))}
          points={series.map((s) => ({ label: s.date.slice(5), value: s[metric] }))}
        />
      )}
    </Card>
  );
}
