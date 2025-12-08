import type { PropsWithChildren, ReactNode } from 'react';

export interface SidebarItem {
  key: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export interface AppShellProps extends PropsWithChildren {
  sidebar?: SidebarItem[];
  topbarSlot?: ReactNode;
  footerSlot?: ReactNode;
}

export const AppShell = ({ sidebar, topbarSlot, footerSlot, children }: AppShellProps) => (
  <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
    {sidebar && <Sidebar items={sidebar} />}
    <div className="flex flex-1 flex-col">
      {topbarSlot}
      <main className="flex-1 px-6 py-4">{children}</main>
      {footerSlot && <footer className="border-t border-zinc-200 px-6 py-3 text-sm text-zinc-500">{footerSlot}</footer>}
    </div>
  </div>
);

export const Sidebar = ({ items }: { items: SidebarItem[] }) => (
  <aside className="hidden w-60 border-r border-zinc-200 bg-white/80 px-3 py-4 backdrop-blur md:block">
    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">导航</div>
    <nav className="space-y-2">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={item.onClick}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            item.active ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-700 hover:bg-zinc-100'
          }`}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  </aside>
);

export const Topbar = ({ title, actions }: { title: string; actions?: ReactNode }) => (
  <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white/80 px-6 py-3 backdrop-blur">
    <div className="text-lg font-semibold text-zinc-900">{title}</div>
    <div className="flex items-center gap-2">{actions}</div>
  </header>
);

export const StatCard = ({ title, value, hint }: { title: string; value: string; hint?: string }) => (
  <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
    <div className="text-sm text-zinc-500">{title}</div>
    <div className="mt-2 text-2xl font-semibold text-zinc-900">{value}</div>
    {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
  </div>
);
