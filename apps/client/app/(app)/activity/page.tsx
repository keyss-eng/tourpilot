'use client';

import { Card } from '@/components/ui/Card';
import { QueryState } from '@/components/QueryState';
import { EmptyState } from '@/components/EmptyState';
import { useEvents } from '@/hooks/useDashboard';
import { timeAgo } from '@/lib/format';
import type { ActivityEvent } from '@/types/api';

// Client account activity → a coloured dot + readable label. Only account
// actions are logged (login / logout / signup / plan_change).
function describe(e: ActivityEvent): { color: string; text: string } {
  const action = String(e.action ?? 'event');
  const email = (e.email as string | undefined) ?? '';
  const who = email ? ` · ${email}` : '';
  switch (action) {
    case 'login':
      return { color: 'bg-success', text: `Signed in${who}` };
    case 'logout':
      return { color: 'bg-muted', text: `Signed out${who}` };
    case 'signup':
      return { color: 'bg-primary', text: `Account created${who}` };
    case 'plan_change':
      return { color: 'bg-warning', text: `Plan changed to ${String(e.plan ?? '')}` };
    default:
      return { color: 'bg-muted', text: action };
  }
}

export default function ActivityPage() {
  const events = useEvents(50);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Activity</h1>
      <QueryState query={events}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              icon="⚡"
              title="No activity yet"
              subtitle="Your account activity — sign-ins, sign-outs and plan changes — will appear here."
            />
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
    </div>
  );
}
