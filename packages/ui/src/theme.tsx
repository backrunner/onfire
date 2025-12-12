import type { PropsWithChildren } from 'react';
import { cn } from './utils';

export interface ThemeRootProps extends PropsWithChildren {
  className?: string;
}

export const ThemeRoot = ({ children, className }: ThemeRootProps) => (
  <div className={cn('min-h-screen bg-background text-foreground antialiased', className)}>{children}</div>
);

