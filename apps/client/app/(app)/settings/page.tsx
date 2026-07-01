'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { QueryState } from '@/components/QueryState';
import { useSettings, useSaveSettings } from '@/hooks/useDashboard';
import { cn } from '@/lib/cn';

export default function SettingsPage() {
  const settings = useSettings();
  const save = useSaveSettings();

  const [config, setConfig] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  // Seed local state once the server config loads.
  useEffect(() => {
    if (settings.data) setConfig(settings.data.config);
  }, [settings.data]);

  const toggle = (id: string) => {
    setConfig((c) => ({ ...c, [id]: !c[id] }));
    setDirty(true);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <Badge tone="muted">Tour elements</Badge>
      </div>
      <p className="mb-6 max-w-xl text-sm text-muted">
        Choose which elements on your site can become tour steps. Turn off anything you don't want
        tours pointing at. Changes apply the next time a tour is generated.
      </p>

      <QueryState query={settings}>
        {(d) => (
          <Card>
            <CardTitle>Actionable elements</CardTitle>
            <ul className="divide-y divide-border">
              {d.categories.map((cat) => {
                const on = config[cat.id] ?? false;
                return (
                  <li key={cat.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-medium">{cat.label}</div>
                      <div className="text-xs text-muted">{cat.hint}</div>
                    </div>
                    <button
                      role="switch"
                      aria-checked={on}
                      onClick={() => toggle(cat.id)}
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                        on ? 'bg-brand-700 dark:bg-brand-500' : 'bg-slate-200 dark:bg-slate-800'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                          on ? 'translate-x-6' : 'translate-x-1'
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={() => {
                  setConfig(d.defaults);
                  setDirty(true);
                }}
                className="text-xs text-muted hover:text-text"
              >
                Reset to defaults
              </button>
              <button
                disabled={!dirty || save.isPending}
                onClick={() =>
                  save.mutate(config, { onSuccess: () => setDirty(false) })
                }
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-semibold transition-colors border',
                  dirty && !save.isPending
                    ? 'bg-brand-700 border-brand-700 hover:bg-brand-800 text-white'
                    : 'cursor-not-allowed bg-border border-border text-muted opacity-60'
                )}
              >
                {save.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
              </button>
            </div>
          </Card>
        )}
      </QueryState>
    </div>
  );
}
