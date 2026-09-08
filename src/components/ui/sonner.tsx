"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/components/ui/theme-provider";

const horizontalOffset =
  "max(1rem, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))";
const offset = {
  top: "calc(var(--toast-header-height, 0px) + 1rem + env(safe-area-inset-top, 0px))",
  left: horizontalOffset,
  right: horizontalOffset,
};

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      richColors
      position="top-center"
      offset={offset}
      mobileOffset={offset}
      style={{
        // Keep entering and leaving toasts from covering the header during motion.
        clipPath: "inset(-8px -100vw -100vh)",
      }}
    />
  );
}
