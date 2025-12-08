import * as DrawerPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export const Drawer = DrawerPrimitive.Root;
export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerPortal = DrawerPrimitive.Portal;
export const DrawerOverlay = ({ className, ...props }: DrawerPrimitive.DialogOverlayProps) => (
  <DrawerPrimitive.Overlay className={twMerge('fixed inset-0 bg-black/30 backdrop-blur-sm', className)} {...props} />
);
export const DrawerContent = ({ className, side = 'right', ...props }: DrawerPrimitive.DialogContentProps & { side?: 'left' | 'right' }) => {
  const sideClass = side === 'right' ? 'right-0 translate-x-0' : 'left-0 translate-x-0';
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        className={twMerge(
          'fixed top-0 z-50 h-full w-full max-w-xl bg-white shadow-2xl transition-transform',
          sideClass,
          className
        )}
        {...props}
      />
    </DrawerPortal>
  );
};
export const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={twMerge('flex items-center justify-between border-b border-zinc-200 px-4 py-3', className)} {...props} />
);
export const DrawerTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={twMerge('text-lg font-semibold text-zinc-900', className)} {...props} />
);
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerCloseButton = () => (
  <DrawerClose className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100">
    <X className="h-4 w-4" />
  </DrawerClose>
);

