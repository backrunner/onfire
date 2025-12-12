import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { cn } from './utils';
import { ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';

export interface SidebarItem {
  key: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  path?: string;
  onClick?: () => void;
}

export interface AppShellProps extends PropsWithChildren {
  sidebar?: SidebarItem[];
  topbarSlot?: ReactNode;
  footerSlot?: ReactNode;
  sidebarCollapsed?: boolean;
  onSidebarCollapse?: (collapsed: boolean) => void;
}

export const AppShell = ({
  sidebar,
  topbarSlot,
  footerSlot,
  children,
  sidebarCollapsed: controlledCollapsed,
  onSidebarCollapse
}: AppShellProps) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const setCollapsed = onSidebarCollapse ?? setInternalCollapsed;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {sidebar && (
        <Sidebar
          items={sidebar}
          collapsed={collapsed}
          onCollapse={setCollapsed}
        />
      )}
      <div className="flex flex-1 flex-col">
        {topbarSlot}
        <main className="flex-1 overflow-hidden">{children}</main>
        {footerSlot && (
          <footer className="border-t border-border px-6 py-3 text-sm text-muted-foreground">
            {footerSlot}
          </footer>
        )}
      </div>
    </div>
  );
};

export const Sidebar = ({
  items,
  collapsed,
  onCollapse
}: {
  items: SidebarItem[];
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
}) => (
  <aside
    className={cn(
      'hidden flex-col border-r border-border bg-card/50 backdrop-blur-sm transition-all duration-200 md:flex',
      collapsed ? 'w-16' : 'w-60'
    )}
  >
    <div className="flex h-14 items-center justify-between border-b border-border px-3">
      {!collapsed && (
        <span className="text-lg font-bold tracking-tight">OnFire</span>
      )}
      <button
        onClick={() => onCollapse?.(!collapsed)}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
          collapsed && 'mx-auto'
        )}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </div>
    <nav className="flex-1 space-y-1 p-2">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={item.onClick}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            item.active
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            collapsed && 'justify-center px-2'
          )}
          title={collapsed ? item.label : undefined}
        >
          {item.icon}
          {!collapsed && <span>{item.label}</span>}
        </button>
      ))}
    </nav>
    <div className="border-t border-border p-2">
      <ThemeToggle collapsed={collapsed} />
    </div>
  </aside>
);

export const ThemeToggle = ({ collapsed }: { collapsed?: boolean }) => {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === 'system') {
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    } else {
      setTheme(theme === 'dark' ? 'light' : 'dark');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        collapsed && 'justify-center px-2'
      )}
      title={collapsed ? '切换主题' : undefined}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
      {!collapsed && <span>切换主题</span>}
    </button>
  );
};

export const Topbar = ({
  title,
  subtitle,
  actions,
  breadcrumbs
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbs?: { label: string; onClick?: () => void }[];
}) => (
  <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <div className="flex flex-col">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span>/</span>}
              {crumb.onClick ? (
                <button
                  onClick={crumb.onClick}
                  className="hover:text-foreground transition-colors"
                >
                  {crumb.label}
                </button>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle && (
          <span className="text-sm text-muted-foreground">{subtitle}</span>
        )}
      </div>
    </div>
    <div className="flex items-center gap-3">{actions}</div>
  </header>
);

export const StatCard = ({
  title,
  value,
  hint,
  icon,
  trend,
  className
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  trend?: { value: number; label?: string };
  className?: string;
}) => (
  <div
    className={cn(
      'rounded-xl border border-border bg-card p-4 shadow-sm transition-colors',
      className
    )}
  >
    <div className="flex items-start justify-between">
      <span className="text-sm font-medium text-muted-foreground">{title}</span>
      {icon && (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </span>
      )}
    </div>
    <div className="mt-2 flex items-baseline gap-2">
      <span className="text-2xl font-bold tracking-tight">{value}</span>
      {trend && (
        <span
          className={cn(
            'text-xs font-medium',
            trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'
          )}
        >
          {trend.value >= 0 ? '+' : ''}
          {trend.value}%{trend.label && ` ${trend.label}`}
        </span>
      )}
    </div>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export const SplitView = ({
  list,
  detail,
  showDetail = true,
  listWidth = '400px'
}: {
  list: ReactNode;
  detail?: ReactNode;
  showDetail?: boolean;
  listWidth?: string;
}) => (
  <div className="flex h-full">
    <div
      className={cn(
        'flex-shrink-0 border-r border-border overflow-auto',
        showDetail && detail ? '' : 'flex-1'
      )}
      style={showDetail && detail ? { width: listWidth } : undefined}
    >
      {list}
    </div>
    {showDetail && detail && (
      <div className="flex-1 overflow-auto">{detail}</div>
    )}
  </div>
);
