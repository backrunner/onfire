/**
 * Rich-text helpers for ticket replies.
 *
 * Agent/customer composers and inbound mail produce HTML. Everything persisted
 * in replies.contentHtml passes through sanitizeRichHtml — a strict allowlist
 * sanitizer — so the ticket views and outbound email templates can trust the
 * stored markup.
 */

const VOID_TAGS = new Set(["br", "hr", "img"]);

const ALLOWED_TAGS = new Set([
  "p", "div", "span", "br", "hr",
  "strong", "b", "em", "i", "u", "s", "del",
  "a", "ul", "ol", "li", "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "img", "figure", "figcaption",
]);

// Tags whose entire subtree is discarded instead of unwrapped.
const DROP_SUBTREE_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "form",
  "head", "title", "meta", "link", "noscript", "template",
  "svg", "math", "audio", "video", "canvas",
  "button", "select", "textarea", "input",
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        return String.fromCodePoint(code);
      }
      return match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

export function escapeRichText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeRichText(value).replace(/"/g, "&quot;");
}

/**
 * Allow only http(s) URLs, mailto links, inline data images, and our own
 * attachment path. Anything else (javascript:, data:text/html, cid:, file:)
 * is rejected. Entity-encoded and whitespace-padded schemes are normalized
 * before the check.
 */
function sanitizeUrl(raw: string, kind: "link" | "image"): string | null {
  const cleaned = decodeEntities(raw)
    .trim()
    // Browsers ignore ASCII whitespace/control chars inside schemes.
    .replace(/[\u0000-\u0020\u007F-\u009F]+/g, "");
  if (kind === "image" && /^\/api\/attachments\/[a-z0-9]+$/i.test(cleaned)) {
    return cleaned;
  }
  if (
    kind === "image" &&
    /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(cleaned)
  ) {
    return cleaned;
  }
  if (/^https?:\/\/[^\s"<>]+$/i.test(cleaned)) return cleaned;
  if (kind === "link" && /^mailto:[^\s@<>]+@[^\s@<>]+$/i.test(cleaned)) {
    return cleaned;
  }
  return null;
}

const ATTR_RE =
  /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/**
 * Build the sanitized attribute string for an allowed tag. Returns null when
 * the tag is meaningless without a rejected attribute (an <img> without a
 * trusted src).
 */
function sanitizeAttrs(tag: string, raw: string): string | null {
  let href: string | null = null;
  let src: string | null = null;
  let alt: string | null = null;

  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(raw)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (tag === "a" && name === "href") href = sanitizeUrl(value, "link");
    if (tag === "img" && name === "src") src = sanitizeUrl(value, "image");
    if (tag === "img" && name === "alt") alt = decodeEntities(value).trim();
  }

  if (tag === "a") {
    if (!href) return "";
    return ` href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer nofollow"`;
  }
  if (tag === "img") {
    if (!src) return null;
    return ` src="${escapeAttr(src)}"${alt ? ` alt="${escapeAttr(alt)}"` : ""} loading="lazy"`;
  }
  return "";
}

const TOKEN_RE =
  /<!--[\s\S]*?-->|<![^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?)*)\s*(\/?)>|([^<]+|<(?![a-zA-Z!/]))/g;

/** Strict allowlist HTML sanitizer for reply content. */
export function sanitizeRichHtml(html: string): string {
  let out = "";
  const stack: string[] = [];
  let dropDepth = 0;
  let dropTag = "";

  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(html)) !== null) {
    if (match[5] !== undefined) {
      if (dropDepth === 0) out += escapeRichText(match[5]);
      continue;
    }
    if (match[2] === undefined) continue; // comment, doctype, or malformed

    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();

    if (DROP_SUBTREE_TAGS.has(tag)) {
      if (!closing) {
        if (dropDepth === 0) {
          dropDepth = 1;
          dropTag = tag;
        } else if (tag === dropTag) {
          dropDepth += 1;
        }
      } else if (dropDepth > 0 && tag === dropTag) {
        dropDepth -= 1;
      }
      continue;
    }
    if (dropDepth > 0) continue;
    if (!ALLOWED_TAGS.has(tag)) continue; // unwrap unknown tags, keep text

    if (closing) {
      const index = stack.lastIndexOf(tag);
      if (index !== -1) {
        while (stack.length > index) out += `</${stack.pop()}>`;
      }
      continue;
    }

    const attrs = sanitizeAttrs(tag, match[3] ?? "");
    if (attrs === null) continue; // e.g. <img> without a trusted src
    out += `<${tag}${attrs}>`;
    if (!VOID_TAGS.has(tag) && match[4] !== "/") stack.push(tag);
  }

  while (stack.length > 0) out += `</${stack.pop()}>`;
  return out;
}

/** Plain-text rendering of rich HTML (text email part, validation, previews). */
export function richHtmlToText(html: string): string {
  let text = html.replace(
    /<(script|style|iframe|object|embed|template)[\s\S]*?<\/\1>/gi,
    ""
  );
  text = text.replace(/<img\b[^>]*?\balt="([^"]*)"[^>]*>/gi, "$1");
  text = text.replace(/<img\b[^>]*>/gi, "");
  text = text.replace(/<li\b[^>]*>/gi, "• ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<hr\s*\/?>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(
    /<\/(p|div|blockquote|pre|h[1-6]|figure|figcaption|ul|ol)>/gi,
    "\n\n"
  );
  text = text.replace(/<[^>]*>/g, "");
  text = decodeEntities(text);
  text = text.replace(/[^\S\n]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** True when the HTML carries no visible text and no image. */
export function richTextIsEmpty(html: string): boolean {
  const sanitized = sanitizeRichHtml(html);
  if (/<img\b/i.test(sanitized)) return false;
  return richHtmlToText(sanitized).length === 0;
}
