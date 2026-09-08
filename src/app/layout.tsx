import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider, LANGUAGE_COOKIE, type Language } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";
import { isTheme, THEME_COOKIE, type Theme } from "@/lib/theme";

export async function generateMetadata(): Promise<Metadata> {
  const proxied =
    (await headers()).get("x-onfire-proxy-prefix") === "/support";
  return {
    title: "OnFire - Modern Ticket System",
    description: "A minimalist modern ticket system for support teams",
    icons: { icon: proxied ? "/support/icon.svg" : "/icon.svg" },
  };
}

/**
 * Resolve the UI language on the server (cookie → Accept-Language → en) so
 * the SSR HTML is already in the right language — no post-hydration flash.
 */
async function resolveLanguage(): Promise<Language> {
  const saved = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  if (saved === "zh" || saved === "en") return saved;
  const accept = (await headers()).get("accept-language") ?? "";
  return /(^|,)\s*zh\b/i.test(accept) ? "zh" : "en";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const language = await resolveLanguage();
  const savedTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const initialTheme: Theme | undefined = isTheme(savedTheme)
    ? savedTheme
    : undefined;

  return (
    <html
      lang={language === "zh" ? "zh-CN" : "en"}
      className={initialTheme}
      style={initialTheme ? { colorScheme: initialTheme } : undefined}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var c=document.cookie.match(/(?:^|; )onfire-theme=(dark|light)(?:;|$)/);var t=c?c[1]:localStorage.getItem('onfire-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}",
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <TooltipProvider>
            <I18nProvider initialLanguage={language}>{children}</I18nProvider>
          </TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
