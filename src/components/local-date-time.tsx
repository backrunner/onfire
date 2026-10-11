"use client";

import { useSyncExternalStore } from "react";
import { formatDateTime } from "@/lib/utils";

const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

/** UTC HTML hydrates identically in every time zone, then displays local time. */
export function LocalDateTime({ value }: { value: string }) {
  const browser = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  const date = new Date(value);
  const utc = Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 19).replace("T", " ");
  return <time dateTime={value}>{browser ? formatDateTime(value) : `${utc} UTC`}</time>;
}
