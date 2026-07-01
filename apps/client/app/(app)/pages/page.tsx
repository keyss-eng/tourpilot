'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { QueryState } from '@/components/QueryState';
import { EmptyState } from '@/components/EmptyState';
import { usePages } from '@/hooks/useDashboard';
import { num } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { TimeRange } from '@/types/api';

const RANGES: { id: TimeRange; label: string; sub: string }[] = [
  { id: 'hour', label: 'Hour', sub: 'last 24 hours' },
  { id: 'day', label: 'Daily', sub: 'last 30 days' },
  { id: 'week', label: 'Weekly', sub: 'last 12 weeks' },
  { id: 'month', label: 'Monthly', sub: 'last 12 months' },
];

export default function PagesPage() {
  const [range, setRange] = useState<TimeRange>('day');
  const pages = usePages(range);
  const sub = RANGES.find((r) => r.id === range)!.sub;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pages</h1>
          <p className="mt-0.5 text-sm text-muted">Generated &amp; shown · {sub}</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                range === r.id
                  ? 'bg-brand-600 text-white font-semibold shadow-sm'
                  : 'text-brand-600 dark:text-brand-300 hover:text-brand-700 dark:hover:text-white'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <QueryState query={pages}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              icon="📄"
              title="No tours in this period"
              subtitle="Tours generated and shown will appear here. Try a wider range, or set up the integration."
              href="/integration"
              cta="Set up integration"
            />
          ) : (
            <Card className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted">
                    <th className="px-4 py-3 font-medium">Page</th>
                    <th className="px-4 py-3 text-right font-medium">Generated</th>
                    <th className="px-4 py-3 text-right font-medium">Shown</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.contextKey} className="border-b last:border-0 transition-colors hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-mono text-xs">{r.contextKey}</td>
                      <td className="px-4 py-3 text-right">{num(r.generations)}</td>
                      <td className="px-4 py-3 text-right">{num(r.shown)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )
        }
      </QueryState>
    </div>
  );
}
