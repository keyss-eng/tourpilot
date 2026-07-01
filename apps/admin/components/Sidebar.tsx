'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useMe } from '@/hooks/useDashboard';
import { Brand } from '@/components/Brand';

const NAV = [
  { href: '/overview', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6' },
  { href: '/pages', label: 'Pages', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { href: '/activity', label: 'Activity', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { href: '/billing', label: 'Billing', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { href: '/plans', label: 'Plans', icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
  { href: '/integration', label: 'Integration', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
  { href: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const isAdmin = me.data?.account.role === 'admin';

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border/70 bg-surface px-3 py-5">
      <div className="px-2 pb-7">
        <Brand />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted/70">
          Workspace
        </p>
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all',
                active
                  ? 'bg-primary/15 font-medium text-text shadow-[inset_0_0_0_1px_rgba(124,131,255,0.25)]'
                  : 'text-muted hover:bg-white/5 hover:text-text'
              )}
            >
              <span className={cn(active ? 'text-primary' : 'text-muted group-hover:text-text')}>
                <Icon d={item.icon} />
              </span>
              {item.label}
            </Link>
          );
        })}

        {isAdmin ? (
          <>
            <p className="px-3 pb-2 pt-5 text-[11px] font-medium uppercase tracking-wider text-muted/70">
              Owner
            </p>
            <Link
              href="/admin/projects"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/10"
            >
              <span><Icon d="M12 4.5A2.5 2.5 0 1112 9.5 2.5 2.5 0 0112 4.5zM4 20a8 8 0 0116 0" /></span>
              Admin portal
            </Link>
          </>
        ) : null}
      </nav>

      <button
        onClick={logout}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-white/5 hover:text-text"
      >
        <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        Log out
      </button>
    </aside>
  );
}
