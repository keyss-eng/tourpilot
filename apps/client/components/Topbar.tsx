'use client';

import { useMe } from '@/hooks/useDashboard';
import { ThemeToggle } from '@/components/ThemeToggle';

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  const me = useMe();
  const initial = me.data?.account.email?.[0]?.toUpperCase() ?? '·';

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-bg/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          title="Menu"
          aria-label="Open menu"
          className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted hover:bg-surface-2 hover:text-text lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="text-sm font-semibold tracking-tight">{me.data?.project.name ?? ' '}</div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <ThemeToggle />
        {me.data ? (
          <>
            <span className="rounded-full bg-brand-500/10 px-2.5 py-1 font-semibold capitalize text-brand-300">
              {me.data.project.plan} plan
            </span>
            <span className="hidden text-muted sm:block">{me.data.account.email}</span>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
              {initial}
            </span>
          </>
        ) : null}
      </div>
    </header>
  );
}
