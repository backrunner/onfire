import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Compact label/value groups that wrap as units instead of a delimited sentence. */
export function MetadataList({ className, ...props }: ComponentProps<"dl">) {
  return <dl className={cn("flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs", className)} {...props} />;
}

export function MetadataItem({
  label,
  children,
  hideLabel = false,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  hideLabel?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 max-w-full items-baseline gap-1.5", className)}>
      <dt className={hideLabel ? "sr-only" : "shrink-0 text-muted-foreground"}>{label}</dt>
      <dd className="min-w-0 wrap-anywhere text-foreground/80">{children}</dd>
    </div>
  );
}
