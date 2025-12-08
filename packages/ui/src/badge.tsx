import clsx from 'clsx';

export const Badge = ({ children, variant = 'default', className }: { children: React.ReactNode; variant?: 'default' | 'warning' | 'success' | 'info'; className?: string }) => {
  const style: Record<string, string> = {
    default: 'bg-zinc-100 text-zinc-700',
    warning: 'bg-amber-100 text-amber-800',
    success: 'bg-emerald-100 text-emerald-700',
    info: 'bg-indigo-100 text-indigo-700'
  };
  return <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', style[variant], className)}>{children}</span>;
};

