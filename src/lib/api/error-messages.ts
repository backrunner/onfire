import type { NextRequest } from "next/server";
import { err } from "./response";
import { zhErrorMessages } from "./error-messages.zh";

/**
 * API error message localization.
 *
 * Server code keeps English source messages (they double as stable keys);
 * the response layer translates them for zh users based on the `onfire-lang`
 * cookie (falling back to Accept-Language), so error toasts match the UI
 * language. Unmapped messages pass through unchanged.
 */

// Mirrors LANGUAGE_COOKIE in @/lib/i18n. Kept separate so API modules do not
// pull the React i18n provider into the server bundle.
const LANGUAGE_COOKIE = "onfire-lang";

export type ApiLanguage = "en" | "zh";

export function requestLanguage(req: NextRequest): ApiLanguage {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)onfire-lang=(\w+)/);
  if (match?.[1] === "zh" || match?.[1] === "en") return match[1];
  const accept = (req.headers.get("accept-language") ?? "").toLowerCase();
  return accept.startsWith("zh") || accept.includes(";zh") || accept.includes(",zh")
    ? "zh"
    : "en";
}

export function localizeApiErrorMessage(
  message: string,
  lang: ApiLanguage
): string {
  if (lang === "en") return message;
  const exact = zhErrorMessages[message];
  if (exact) return exact;
  for (const [pattern, render] of zhErrorPatterns) {
    const match = message.match(pattern);
    if (match) return render(match);
  }
  return message;
}

/** Status tokens used inside parameterized lifecycle messages. */
const zhStatusWords: Record<string, string> = {
  new: "新工单",
  processing: "处理中",
  replied: "已回复",
  escalated: "已升级",
  closed: "已关闭",
};

function zhStatus(word: string): string {
  return zhStatusWords[word] ?? word;
}

/**
 * Pattern translations for parameterized messages that exact matching cannot
 * cover. Keep in sync with the source template literals listed at the bottom
 * of error-messages.zh.ts.
 */
const zhErrorPatterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [
    /^Ticket is already in status "(\w+)"$/,
    (m) => `工单已处于「${zhStatus(m[1])}」状态`,
  ],
  [
    /^Invalid status transition: (\w+) → (\w+)$/,
    (m) => `非法的状态流转：${zhStatus(m[1])} → ${zhStatus(m[2])}`,
  ],
  [
    /^Use the dedicated (\w+) action$/,
    (m) => `请使用专门的「${zhStatus(m[1])}」操作`,
  ],
  [
    /^A "(\w+)" template already exists for this product$/,
    (m) => `该产品已存在「${m[1]}」类型的模板`,
  ],
];

/** Localized variant of `err()` for routes with the request in scope. */
export function localizedErr(
  req: NextRequest,
  message: string,
  status = 400,
  details?: unknown
) {
  return err(localizeApiErrorMessage(message, requestLanguage(req)), status, details);
}

export { LANGUAGE_COOKIE };
