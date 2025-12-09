import type { PropsWithChildren } from 'react';
import { cn } from './utils';

export interface ThemeProviderProps extends PropsWithChildren {
  className?: string;
}

export const ThemeProvider = ({ children, className }: ThemeProviderProps) => (
  <div className={cn('min-h-screen bg-background text-foreground antialiased', className)}>{children}</div>
);

