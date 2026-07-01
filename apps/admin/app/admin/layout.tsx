import { AdminSidebar } from '@/components/AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex flex-1 flex-col bg-grid-fade">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/70 bg-bg/80 px-8 py-4 backdrop-blur">
          <div className="text-sm font-semibold tracking-tight">Admin portal</div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary">
            All clients
          </span>
        </header>
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
