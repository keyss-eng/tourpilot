'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { QueryState } from '@/components/QueryState';
import { useAdminProjects, useSetBlocked } from '@/hooks/useAdmin';
import { RangePresets } from '@/components/RangePresets';
import { ClientDetail } from '@/components/ClientDetail';
import { cn } from '@/lib/cn';
import { daysAgo, rangeFor, today, type Preset } from '@/lib/range';

type StatusFilter = 'all' | 'active' | 'blocked';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'blocked', label: 'Blocked' },
];

export default function AdminUsersPage() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [cFrom, setCFrom] = useState(daysAgo(30));
  const [cTo, setCTo] = useState(today());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { from, to } = useMemo(() => rangeFor(preset, cFrom, cTo), [preset, cFrom, cTo]);

  const data = useAdminProjects(from, to);
  const block = useSetBlocked();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="mt-0.5 text-sm text-muted">Manage clients — usage, status and per-client data.</p>
        </div>
        <RangePresets preset={preset} setPreset={setPreset} cFrom={cFrom} setCFrom={setCFrom} cTo={cTo} setCTo={setCTo} />
      </div>

      <QueryState query={data}>
        {(d) => {
          const q = search.trim().toLowerCase();
          const filtered = d.projects.filter((p) => {
            if (statusFilter === 'active' && p.blocked) return false;
            if (statusFilter === 'blocked' && !p.blocked) return false;
            if (q && !(`${p.name} ${p.email ?? ''}`.toLowerCase().includes(q))) return false;
            return true;
          });
          const selected =
            filtered.find((p) => p.id === selectedId) ?? d.projects.find((p) => p.id === selectedId) ?? filtered[0] ?? null;

          return (
            <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
              {/* Sidebar list */}
              <Card className="p-0">
                <div className="space-y-2 border-b border-border p-3">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search clients…"
                    className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  <div className="flex gap-1 rounded-lg border border-border bg-bg p-1">
                    {STATUS_FILTERS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setStatusFilter(s.id)}
                        className={cn(
                          'flex-1 rounded-md px-2 py-1 text-xs transition-colors',
                          statusFilter === s.id ? 'bg-primary/15 text-text' : 'text-muted hover:text-text'
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted">{filtered.length} of {d.projects.length} clients</p>
                </div>
                <ul className="max-h-[560px] overflow-y-auto">
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => setSelectedId(p.id)}
                        className={cn(
                          'flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0',
                          selected?.id === p.id ? 'bg-primary/10' : 'hover:bg-white/[0.02]'
                        )}
                      >
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', p.blocked ? 'bg-danger' : 'bg-success')} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{p.email ?? p.name}</span>
                          <span className="block truncate text-xs text-muted">{p.name}</span>
                        </span>
                        <span className="shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] capitalize text-muted">
                          {p.plan}
                        </span>
                      </button>
                    </li>
                  ))}
                  {filtered.length === 0 ? (
                    <li className="px-3 py-8 text-center text-sm text-muted">No clients match.</li>
                  ) : null}
                </ul>
              </Card>

              {/* Detail */}
              {selected ? (
                <ClientDetail
                  client={selected}
                  blocking={block.isPending}
                  onToggleBlock={() => block.mutate({ projectId: selected.id, blocked: !selected.blocked })}
                />
              ) : (
                <Card className="flex items-center justify-center text-sm text-muted">
                  Select a client to view details.
                </Card>
              )}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
