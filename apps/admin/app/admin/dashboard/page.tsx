'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/StatCard';
import { QueryState } from '@/components/QueryState';
import { useAdminProjects } from '@/hooks/useAdmin';
import { AdminChart } from '@/components/AdminChart';
import { RangePresets } from '@/components/RangePresets';
import { money, num } from '@/lib/format';
import { daysAgo, rangeFor, today, type Preset } from '@/lib/range';

export default function AdminDashboardPage() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [cFrom, setCFrom] = useState(daysAgo(30));
  const [cTo, setCTo] = useState(today());
  const { from, to } = useMemo(() => rangeFor(preset, cFrom, cTo), [preset, cFrom, cTo]);

  const data = useAdminProjects(from, to);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted">Revenue, AI cost and profit across all clients.</p>
        </div>
        <RangePresets preset={preset} setPreset={setPreset} cFrom={cFrom} setCFrom={setCFrom} cTo={cTo} setCTo={setCTo} />
      </div>

      <QueryState query={data}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Revenue (MRR)" value={money(d.totals.revenue)} hint={`from ${d.totals.clients} clients`} />
              <StatCard label="Total AI tokens" value={num(d.totals.tokensUsed)} hint={`${num(d.totals.toursGenerated)} tours generated`} />
              <StatCard label="Total AI cost" value={money(d.totals.tokenCostCents)} hint="our spend" />
              <StatCard
                label="Profit"
                value={money(d.totals.profit)}
                hint={d.totals.revenue > 0 ? `${Math.round((d.totals.profit / d.totals.revenue) * 100)}% margin` : 'revenue − AI cost'}
              />
            </div>

            <Card className="bg-primary/[0.04]">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="font-medium">How profit works:</span>
                <span className="text-muted">
                  <span className="text-success">Revenue</span> (monthly plan price)
                  {' − '}
                  <span className="text-danger">AI token cost</span>
                  {' = '}
                  <span className="text-text">Profit</span>
                </span>
                <span className="ml-auto text-xs text-muted">{d.range.from} → {d.range.to}</span>
              </div>
            </Card>

            <AdminChart from={from} to={to} />
          </>
        )}
      </QueryState>
    </div>
  );
}
