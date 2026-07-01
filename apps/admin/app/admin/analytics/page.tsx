'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/StatCard';
import { QueryState } from '@/components/QueryState';
import { useAdminProjects, type AdminProject } from '@/hooks/useAdmin';
import { AdminChart } from '@/components/AdminChart';
import { RangePresets } from '@/components/RangePresets';
import { money, num, usdFromMicro } from '@/lib/format';
import { cn } from '@/lib/cn';
import { daysAgo, rangeFor, today, type Preset } from '@/lib/range';

function toCsv(rows: AdminProject[]): string {
  const head = ['Client', 'Email', 'Plan', 'Users', 'ToursGenerated', 'ToursShown', 'TokensUsed', 'AICostUSD', 'RevenueUSD', 'ProfitUSD', 'Blocked'];
  const lines = rows.map((p) => [
    p.name, p.email ?? '', p.plan, p.mau, p.toursGenerated, p.toursShown, p.tokensUsed,
    (p.tokenCostCents / 100).toFixed(2), (p.revenue / 100).toFixed(2), (p.profit / 100).toFixed(2),
    p.blocked ? 'yes' : 'no',
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [head.join(','), ...lines].join('\n');
}

export default function AdminAnalyticsPage() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [cFrom, setCFrom] = useState(daysAgo(30));
  const [cTo, setCTo] = useState(today());
  const { from, to } = useMemo(() => rangeFor(preset, cFrom, cTo), [preset, cFrom, cTo]);

  const data = useAdminProjects(from, to);

  function exportCsv(rows: AdminProject[]) {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aitour-clients-${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Analytics</h1>
          <p className="mt-0.5 text-sm text-muted">Token usage, AI cost and per-client breakdown.</p>
        </div>
        <RangePresets preset={preset} setPreset={setPreset} cFrom={cFrom} setCFrom={setCFrom} cTo={cTo} setCTo={setCTo} />
      </div>

      <QueryState query={data}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Total AI tokens" value={num(d.totals.tokensUsed)} hint="input + output" />
              <StatCard label="Total AI cost" value={money(d.totals.tokenCostCents)} hint="our spend" />
              <StatCard label="Tours generated" value={num(d.totals.toursGenerated)} hint={`${num(d.totals.toursShown)} shown`} />
              <StatCard label="Revenue" value={money(d.totals.revenue)} hint={`from ${d.totals.clients} clients`} />
            </div>

            <AdminChart from={from} to={to} />

            <Card className="p-0">
              <div className="flex items-center justify-between border-b border-border p-3">
                <h3 className="text-sm font-medium">Per-client breakdown</h3>
                <button
                  onClick={() => exportCsv(d.projects)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5"
                >
                  Export CSV
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted">
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 text-right font-medium">Users</th>
                    <th className="px-4 py-3 text-right font-medium">Gen</th>
                    <th className="px-4 py-3 text-right font-medium">Shown</th>
                    <th className="px-4 py-3 text-right font-medium">Tokens</th>
                    <th className="px-4 py-3 text-right font-medium">AI cost</th>
                    <th className="px-4 py-3 text-right font-medium">Revenue</th>
                    <th className="px-4 py-3 text-right font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {d.projects.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 transition-colors hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <Link href={`/admin/projects/${p.id}`} className="text-primary hover:underline">
                          {p.email ?? p.name}
                        </Link>
                        <div className="text-xs text-muted">{p.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs capitalize text-muted">
                          {p.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{num(p.mau)}</td>
                      <td className="px-4 py-3 text-right">{num(p.toursGenerated)}</td>
                      <td className="px-4 py-3 text-right">{num(p.toursShown)}</td>
                      <td className="px-4 py-3 text-right">{num(p.tokensUsed)}</td>
                      <td className="px-4 py-3 text-right" title={usdFromMicro(p.tokenCostMicroUsd)}>{money(p.tokenCostCents)}</td>
                      <td className="px-4 py-3 text-right">{money(p.revenue)}</td>
                      <td className={cn('px-4 py-3 text-right font-medium', p.profit >= 0 ? 'text-success' : 'text-danger')}>
                        {money(p.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </QueryState>
    </div>
  );
}
