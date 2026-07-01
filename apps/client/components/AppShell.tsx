'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

// Holds the mobile-drawer state shared between the hamburger (Topbar) and the
// Sidebar. On lg+ the sidebar is static; on mobile it slides in over an overlay.
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={open} onNavigate={() => setOpen(false)} />

      {open ? (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden"
          aria-hidden
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col bg-grid-fade">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
