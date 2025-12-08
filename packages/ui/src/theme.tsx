import type { PropsWithChildren } from 'react';

export interface ThemeProviderProps extends PropsWithChildren {
  className?: string;
}

export const ThemeProvider = ({ children, className }: ThemeProviderProps) => (
  <div className={className ?? 'min-h-screen bg-zinc-50 text-zinc-900 antialiased'}>{children}</div>
);

