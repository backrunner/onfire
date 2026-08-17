import { cn } from "@/lib/utils";

/**
 * Renders reply HTML that has already passed through sanitizeRichHtml at
 * write time. Never feed unsanitized markup into this component.
 */
export function RichTextView({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  return (
    <div
      className={cn("rich-text", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
