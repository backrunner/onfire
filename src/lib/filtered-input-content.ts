import { decodeEntities, sanitizeRichHtml } from "@/lib/rich-text";

export interface ReviewImage {
  src: string;
  alt: string;
  remote: boolean;
}

/** A display-only projection. Restoring an input always uses its original content. */
export function filteredInputContent(value: string | null) {
  const reviewImages: ReviewImage[] = [];
  if (!value) return { reviewHtml: null, reviewImages };
  const seen = new Set<string>();
  // Extract only canonical attributes emitted by the shared sanitizer. Remote
  // images stay inert until explicitly opened, including tracking pixels.
  const reviewHtml = sanitizeRichHtml(value).replace(/<img src="([^"]*)"(?: alt="([^"]*)")? loading="lazy">/g, (_image, src: string, alt?: string) => {
    const url = decodeEntities(src);
    if (!seen.has(url)) {
      seen.add(url);
      reviewImages.push({ src: url, alt: decodeEntities(alt ?? ""), remote: /^https?:/i.test(url) });
    }
    return "";
  }).replace(/<(a|p|figure)\b[^>]*>\s*<\/\1>/g, "");
  return { reviewHtml, reviewImages };
}
