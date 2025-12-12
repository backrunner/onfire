import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-background',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20',
        outline: 'text-foreground',
        info: 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
        warning: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
        success: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
        // Ticket status badges
        new: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        processing: 'border-transparent bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
        replied: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
        escalated: 'border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
        closed: 'border-transparent bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
        // Priority badges
        high: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        medium: 'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        low: 'border-transparent bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        sm: 'px-2 py-0.5 text-[10px]',
        lg: 'px-3 py-1 text-sm'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { badgeVariants };

