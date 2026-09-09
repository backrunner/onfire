import { defineConfig } from "svedocs/config";
import { en, zh } from "./src/lib/messages.ts";

export default defineConfig({
  site: {
    name: "OnFire",
    title: "OnFire",
    description:
      "Open-source ticketing for product teams. Customer portal, support dashboard, email, and AI on Cloudflare.",
    url: process.env.SITE_URL || "https://onfire.pwp.sh",
  },
  build: { mode: "static" },
  theme: {
    defaultMode: "system",
    readingStyle: "plain",
    palette: { accent: "#b74929", neutral: "zinc" },
    radius: "8px",
    fonts: {
      sans: '"Geist Variable", system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      mono: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Consolas, monospace',
      display: '"Geist Variable", system-ui, sans-serif',
    },
    brand: {
      label: "OnFire",
      href: "/",
      logo: "/onfire-mark.svg",
      mark: false,
    },
    nav: [
      { label: "Product", labelKey: "site.product", href: "/" },
      { label: "Documentation", labelKey: "site.docs", href: "/docs" },
      {
        label: "Deploy",
        labelKey: "site.deploy",
        href: "/docs/start/deployment",
      },
    ],
    social: [
      {
        label: "GitHub",
        href: "https://github.com/backrunner/onfire",
        external: true,
      },
    ],
    codeTheme: { light: "github-light", dark: "github-dark" },
    code: { lineNumbers: false, wrap: false, copyButton: true },
    footer: {
      text: "© 2026 BackRunner & contributors. Apache 2.0.",
      links: [
        { label: "Documentation", labelKey: "site.docs", href: "/docs" },
        {
          label: "Apache 2.0",
          href: "https://github.com/backrunner/onfire/blob/main/LICENSE",
          external: true,
        },
        { label: "svedocs", href: "https://svedocs.dev", external: true },
      ],
    },
  },
  search: { enabled: true, provider: "local", scope: "current" },
  ai: false,
  agent: { enabled: true, negotiation: { enabled: false } },
  checks: { translations: true, assets: true, externalLinks: false },
  seo: {
    sitemap: true,
    robots: true,
    ogImage: false,
    defaultAuthor: "OnFire contributors",
  },
  i18n: {
    defaultLocale: "en",
    locales: [
      { code: "en", label: "English", hreflang: "en" },
      { code: "zh", label: "中文", hreflang: "zh-CN" },
    ],
    messages: { en, zh },
  },
  source: {
    editBaseUrl: "https://github.com/backrunner/onfire/edit/main/apps/site",
  },
});
