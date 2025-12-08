import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogOverlay = ({ className, ...props }: DialogPrimitive.DialogOverlayProps) => (
  <DialogPrimitive.Overlay className={twMerge('fixed inset-0 bg-black/30 backdrop-blur-sm', className)} {...props} />
);
export const DialogContent = ({ className, ...props }: DialogPrimitive.DialogContentProps) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      className={twMerge(
        'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl focus:outline-none',
        className
      )}
      {...props}
    />
  </DialogPortal>
);
export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={twMerge('mb-4 space-y-1', className)} {...props} />
);
export const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={twMerge('text-lg font-semibold text-zinc-900', className)} {...props} />
);
export const DialogDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={twMerge('text-sm text-zinc-600', className)} {...props} />
);
export const DialogClose = DialogPrimitive.Close;
export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={twMerge('mt-4 flex justify-end gap-2', className)} {...props} />
);
export const DialogCloseButton = () => (
  <DialogClose className="absolute right-3 top-3 rounded-full p-1 text-zinc-500 hover:bg-zinc-100">
    <X className="h-4 w-4" />
  </DialogClose>
);

