"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useTheme } from "@/components/ui/theme-provider";
import type { RefObject } from "react";

export const TURNSTILE_SITE_KEY: string | undefined =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** Whether the CAPTCHA widget should be rendered (and a token required). */
export const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);

interface TurnstileWidgetProps {
  /** Receives the verification token on success, null on expiry/error. */
  onToken: (token: string | null) => void;
  /** Imperative handle — call `.reset()` after each submit. */
  widgetRef?: RefObject<TurnstileInstance | undefined>;
}

/**
 * Cloudflare Turnstile widget. Renders nothing when
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is not configured. Deployments must pair the
 * public site key with TURNSTILE_SECRET; a configured backend secret remains
 * fail-closed even when the widget key is accidentally omitted.
 */
export function TurnstileWidget({ onToken, widgetRef }: TurnstileWidgetProps) {
  const { resolvedTheme } = useTheme();

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <Turnstile
      ref={(instance) => {
        if (widgetRef) widgetRef.current = instance ?? undefined;
      }}
      siteKey={TURNSTILE_SITE_KEY}
      onSuccess={onToken}
      onExpire={() => onToken(null)}
      onError={() => onToken(null)}
      options={{
        theme: resolvedTheme === "dark" ? "dark" : "light",
        size: "flexible",
      }}
    />
  );
}

export type { TurnstileInstance };
