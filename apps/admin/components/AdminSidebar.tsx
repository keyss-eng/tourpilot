'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Brand } from '@/components/Brand';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: 'M4 5h6v6H4zM14 5h6v4h-6zM14 13h6v6h-6zM4 15h6v4H4z' },
  { href: '/admin/users', label: 'Users', icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-3-6.7' },
  { href: '/admin/analytics', label: 'Analytics', icon: 'M4 19V5m0 14h16M8 17v-5m4 5V9m4 8v-3' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border/70 bg-surface px-3 py-5">
      <div className="flex items-center gap-2 px-2 pb-7">
        <Brand />
        <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] text-muted">Admin</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted/70">Manage</p>
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
