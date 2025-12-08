import * as React from 'react';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={twMerge(
      'flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 transition focus:border-zinc-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={twMerge(
      'flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 transition focus:border-zinc-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

