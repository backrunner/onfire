"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/** Warm likely navigation on intent without downloading every visible page. */
export function AdminLink(props: ComponentProps<typeof Link>) {
  const router = useRouter();
  const warm = () => { if (typeof props.href === "string") router.prefetch(props.href); };
  return <Link {...props} prefetch={false}
    onMouseEnter={(event) => { warm(); props.onMouseEnter?.(event); }}
    onFocus={(event) => { warm(); props.onFocus?.(event); }} />;
}
