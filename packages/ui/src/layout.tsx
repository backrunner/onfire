import type { PropsWithChildren, ReactNode } from 'react';
import { cn } from './utils';

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
  <div className="flex min-h-screen bg-background text-foreground">
    {sidebar && <Sidebar items={sidebar} />}
    <div className="flex flex-1 flex-col">
      {topbarSlot}
      <main className="flex-1 px-6 py-4">{children}</main>
      {footerSlot && <footer className="border-t border-border px-6 py-3 text-sm text-muted-foreground">{footerSlot}</footer>}
    </div>
  </div>
);

export const Sidebar = ({ items }: { items: SidebarItem[] }) => (
  <aside className="hidden w-60 border-r border-border bg-card/80 px-3 py-4 backdrop-blur md:block">
    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">导航</div>
    <nav className="space-y-2">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={item.onClick}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
            item.active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'
          )}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  </aside>
);

export const Topbar = ({ title, actions }: { title: string; actions?: ReactNode }) => (
  <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/90 px-6 py-3 backdrop-blur">
    <div className="text-lg font-semibold">{title}</div>
    <div className="flex items-center gap-2">{actions}</div>
  </header>
);

export const StatCard = ({ title, value, hint }: { title: string; value: string; hint?: string }) => (
  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
    <div className="text-sm text-muted-foreground">{title}</div>
    <div className="mt-2 text-2xl font-semibold">{value}</div>
    {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
  </div>
);
