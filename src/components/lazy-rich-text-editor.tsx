"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Keep TipTap/ProseMirror out of the page entry. The same chunk is shared by
// the agent and customer composers, and starts loading when a composer mounts.
export const RichTextEditor = dynamic(
  () => import("./rich-text-editor").then((module) => module.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-1" aria-hidden="true">
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    ),
  },
);

export type { RichTextEditorHandle, RichTextValue } from "./rich-text-editor";
