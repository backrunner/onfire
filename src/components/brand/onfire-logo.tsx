// Generated from docs/assets/onfire-mark.svg by scripts/sync-brand.mjs.
import { cn } from "@/lib/utils";

interface OnFireLogoProps {
  className?: string;
  size?: number;
  label?: string;
}

export function OnFireLogo({ className, size = 32, label }: OnFireLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      data-onfire-logo
    >
      <rect width="64" height="64" rx="14" fill="#dc512c"/>
      <g transform="translate(4 2) scale(.9)" fill="#fff7ec">
        <path d="M38 9c0 12 13 19 13 31 0 11-8 19-19 19-7 0-13-3-16-8l24-25-9 5 7-22Z"/>
        <path d="M24 17c0 8 4 11 7 15L13 46c-4-12 3-21 11-29Z"/>
      </g>
    </svg>
  );
}
