'use client';

import { Card, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/StatCard';
import { QueryState } from '@/components/QueryState';
import { useAdminProjectPages, useAdminProjectEvents, type AdminProject } from '@/hooks/useAdmin';
import { money, num, timeAgo, usdFromMicro } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ActivityEvent } from '@/types/api';

export function ClientDetail({
  client,
  blocking,
  onToggleBlock,
}: {
  client: AdminProject;
  blocking: boolean;
  onToggleBlock: () => void;
}) {
  const pages = useAdminProjectPages(client.id);
  const events = useAdminProjectEvents(client.id);
  const profit = client.profit;
  const margin = client.revenue > 0 ? Math.round((profit / client.revenue) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{client.name}</h2>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  client.blocked ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'
                )}
              >
                {client.blocked ? 'Blocked' : 'Active'}
              </span>
            </div>
            <p className="text-sm text-muted">{client.email ?? '—'} · {client.allowedOrigins}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs capitalize">
              Plan: {client.plan}
            </span>
            <button
              disabled={blocking}
              onClick={onToggleBlock}
              className={cn(
                'rounded-lg border border-border px-3 py-1.5 text-xs transition-colors disabled:opacity-50',
                client.blocked ? 'text-muted hover:text-success' : 'text-muted hover:text-danger'
              )}
            >
              {client.blocked ? 'Unblock' : 'Block'}
            </button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Tours generated" value={num(client.toursGenerated)} />
        <StatCard label="Tours viewed" value={num(client.toursShown)} hint={`${num(client.mau)} active users`} />
        <StatCard label="AI tokens used" value={num(client.tokensUsed)} />
        <StatCard label="AI token cost" value={money(client.tokenCostCents)} hint={usdFromMicro(client.tokenCostMicroUsd)} />
      </div>

      <Card>
        <CardTitle>Profitability</CardTitle>
        <dl className="space-y-2 text-sm">
          <Row label="Client charge (revenue)" value={money(client.revenue)} />
          <Row label="Our AI token cost" value={`${money(client.tokenCostCents)}  ·  ${usdFromMicro(client.tokenCostMicroUsd)}`} />
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <dt className="text-muted">Profit</dt>
            <dd className="flex items-center gap-2">
              <span className={profit >= 0 ? 'font-semibold text-success' : 'font-semibold text-danger'}>{money(profit)}</span>
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">{margin}% margin</span>
            </dd>
          </div>
        </dl>
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-medium text-muted">Pages</h3>
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
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-muted">Activity</h3>
        <QueryState query={events}>
          {(rows) =>
            rows.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : (
              <Card className="p-0">
                <ul className="divide-y">
                  {rows.map((e) => {
                    const dd = describe(e);
                    return (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${dd.color}`} />
                        <span className="flex-1">{dd.text}</span>
                        <span className="shrink-0 text-xs text-muted">{e.at ? timeAgo(e.at) : ''}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )
          }
        </QueryState>
      </div>
    </div>
  );
}

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
