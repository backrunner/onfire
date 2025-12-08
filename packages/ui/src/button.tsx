import { cva, type VariantProps } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-zinc-900 text-white hover:bg-zinc-800',
        outline: 'border border-zinc-300 text-zinc-900 hover:bg-zinc-100',
        ghost: 'text-zinc-700 hover:bg-zinc-100'
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-base'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md'
    }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    PropsWithChildren,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  className,
  loading = false,
  children,
  disabled,
  ...rest
}: ButtonProps) => (
  <button
    className={twMerge(buttonVariants({ variant, size }), className)}
    disabled={disabled || loading}
    {...rest}
  >
    {loading ? '处理中…' : children}
  </button>
);
