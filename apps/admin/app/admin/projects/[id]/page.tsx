'use client';

import Link from 'next/link';
import { StatCard } from '@/components/StatCard';
import { Card, CardTitle } from '@/components/ui/Card';
import { QueryState } from '@/components/QueryState';
import { useAdminProject, useAdminProjectPages, useAdminProjectEvents } from '@/hooks/useAdmin';
import { money, num, timeAgo, usdFromMicro } from '@/lib/format';
import type { ActivityEvent } from '@/types/api';

// Client account activity (login / logout / signup / plan_change) — same as the
// client's Activity screen.
function describe(e: ActivityEvent): { color: string; text: string } {
  const action = String(e.action ?? 'event');
  const email = (e.email as string | undefined) ?? '';
  const who = email ? ` · ${email}` : '';
  switch (action) {
    case 'login': return { color: 'bg-success', text: `Signed in${who}` };
    case 'logout': return { color: 'bg-muted', text: `Signed out${who}` };
    case 'signup': return { color: 'bg-primary', text: `Account created${who}` };
    case 'plan_change': return { color: 'bg-warning', text: `Plan changed to ${String(e.plan ?? '')}` };
    case 'blocked': return { color: 'bg-danger', text: 'Account blocked' };
    case 'unblocked': return { color: 'bg-success', text: 'Account unblocked' };
    default: return { color: 'bg-muted', text: action };
  }
}

export default function AdminProjectDetailPage({ params }: { params: { id: string } }) {
  const project = useAdminProject(params.id);
  const pages = useAdminProjectPages(params.id);
  const events = useAdminProjectEvents(params.id);

  return (
    <div>
      <Link href="/admin/projects" className="text-sm text-muted hover:text-text">
        ← All projects
      </Link>
      <QueryState query={project}>
        {(p) => (
          <>
            <div className="mb-6 mt-2 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold">{p.name}</h1>
                <p className="text-sm text-muted">{p.email ?? '—'} · {p.allowedOrigins}</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Plan</span>
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs capitalize">
                  {p.plan}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Active users (this month)" value={num(p.bill.mau)} />
              <StatCard label="Amount due" value={money(p.bill.amountDue)} />
              <StatCard label="Pages with tours" value={num(p.pagesWithTours)} />
              <StatCard label="Tours generated" value={num(p.toursGenerated)} />
            </div>

            {(() => {
              const costCents = Math.round(p.providerCostMicroUsd / 10000); // micro-USD → cents
              const profit = p.revenue - costCents;
              const margin = p.revenue > 0 ? Math.round((profit / p.revenue) * 100) : 0;
              return (
                <Card className="mt-6">
                  <CardTitle>Profitability</CardTitle>
                  <dl className="space-y-2 text-sm">
                    <Row label="Tours generated" value={num(p.toursGenerated)} />
                    <Row label="Client charge (revenue)" value={money(p.revenue)} />
                    <Row
                      label="Our AI token cost"
                      value={`${money(costCents)}  ·  ${usdFromMicro(p.providerCostMicroUsd)}`}
                    />
                    <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                      <dt className="text-muted">Profit</dt>
                      <dd className="flex items-center gap-2">
                        <span className={profit >= 0 ? 'font-semibold text-success' : 'font-semibold text-danger'}>
                          {money(profit)}
                        </span>
                        <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">
                          {margin}% margin
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs text-muted">
                    Profit = revenue − AI token cost. Plan base fee {money(p.bill.baseFee)}
                    {p.bill.overage ? ` + overage ${money(p.bill.overage)}` : ''}.
                  </p>
                </Card>
              );
            })()}

            <h2 className="mb-3 mt-8 text-sm font-medium text-muted">Pages</h2>
            <QueryState query={pages}>
              {(rows) =>
                rows.length === 0 ? (
                  <p className="text-sm text-muted">No tours generated yet.</p>
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

            <h2 className="mb-3 mt-8 text-sm font-medium text-muted">Activity</h2>
            <QueryState query={events}>
              {(rows) =>
                rows.length === 0 ? (
                  <p className="text-sm text-muted">No activity yet.</p>
                ) : (
                  <Card className="p-0">
                    <ul className="divide-y">
                      {rows.map((e) => {
                        const d = describe(e);
                        return (
                          <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${d.color}`} />
                            <span className="flex-1">{d.text}</span>
                            <span className="shrink-0 text-xs text-muted">{e.at ? timeAgo(e.at) : ''}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )
              }
            </QueryState>
          </>
        )}
      </QueryState>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
