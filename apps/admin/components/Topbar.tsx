'use client';

import { useMe } from '@/hooks/useDashboard';

export function Topbar() {
  const me = useMe();
  const initial = me.data?.account.email?.[0]?.toUpperCase() ?? '·';

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/70 bg-bg/80 px-8 py-4 backdrop-blur">
      <div className="text-sm font-semibold tracking-tight">{me.data?.project.name ?? ' '}</div>
      <div className="flex items-center gap-3 text-xs">
        {me.data ? (
          <>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 capitalize text-primary">
              {me.data.project.plan}
            </span>
            <span className="text-muted">{me.data.account.email}</span>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-xs font-medium text-text">
              {initial}
            </span>
          </>
        ) : null}
      </div>
    </header>
  );
}
