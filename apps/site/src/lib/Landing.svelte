<script lang="ts">
  import {
    ArrowRight,
    ArrowUpRight,
    Check,
    Code2,
    Copy,
    Globe2,
    Layers3,
    MessageSquare,
    ShieldCheck,
    Sparkles,
    Webhook,
  } from "@lucide/svelte";
  import { onDestroy } from "svelte";
  import { resolveLocalizedHref } from "svedocs/theme/headless";
  import type { SvedocsThemeContext } from "svedocs/theme/types";
  import WorkspacePreview from "./WorkspacePreview.svelte";
  import BrandMark from "./theme/BrandMark.svelte";

  export let context: SvedocsThemeContext;

  let copied = false;
  let copyFailed = false;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(copyTimer));
  const text = (key: string) => context.t(key);
  const href = (path: string) => resolveLocalizedHref(path, context);
  const guides = [
    {
      icon: ShieldCheck,
      number: "01",
      path: "/docs/guides/access",
      title: "features.access.title",
      body: "features.access.body",
    },
    {
      icon: Layers3,
      number: "02",
      path: "/docs/guides/tickets",
      title: "features.forms.title",
      body: "features.forms.body",
    },
    {
      icon: Sparkles,
      number: "03",
      path: "/docs/guides/ai",
      title: "features.ai.title",
      body: "features.ai.body",
    },
    {
      icon: Webhook,
      number: "04",
      path: "/docs/guides/automation",
      title: "features.auto.title",
      body: "features.auto.body",
    },
  ];
  const principles = [
    { icon: Globe2, title: "workflow.1.title", body: "workflow.1.body" },
    { icon: MessageSquare, title: "workflow.2.title", body: "workflow.2.body" },
    { icon: Check, title: "workflow.3.title", body: "workflow.3.body" },
  ];

  async function copyCommand() {
    clearTimeout(copyTimer);
    copyFailed = false;
    try {
      await navigator.clipboard.writeText(
        "git clone https://github.com/backrunner/onfire.git",
      );
      copied = true;
      copyTimer = setTimeout(() => (copied = false), 1800);
    } catch {
      copied = false;
      copyFailed = true;
    }
  }
</script>

<div class="of-landing" data-locale={context.localeCode}>
  <section class="of-hero" aria-labelledby="of-hero-title">
    <div class="of-hero-copy">
      <p class="of-eyebrow">
        <span class="of-eyebrow-mark"></span>{text("hero.eyebrow")}
      </p>
      <h1 id="of-hero-title">
        {text("hero.title")}<br />{" "}<span>{text("hero.second")}</span>
      </h1>
      <p class="of-hero-description">{text("hero.description")}</p>
      <div class="of-actions">
        <a class="of-button of-button-primary" href={href("/docs")}
          >{text("site.guide")}<ArrowRight size={17} /></a
        >
        <a
          class="of-button of-button-secondary"
          href="https://github.com/backrunner/onfire"
          target="_blank"
          rel="noreferrer"><Code2 size={16} />{text("site.source")}</a
        >
      </div>
      <div class="of-hero-notes">
        <span><Check size={14} />{text("hero.meta")}</span><span
          >Apache 2.0</span
        >
      </div>
    </div>
    <div class="of-hero-art" aria-hidden="true">
      <div class="of-art-heading">
        <span>ONFIRE</span><span>01 — {text("art.label")}</span>
      </div>
      <div class="of-art-mark"><BrandMark size={150} /></div>
      <div class="of-art-receipt">
        <span class="of-receipt-dot"></span>
        <div>
          <strong>{text("art.title")}</strong><small>{text("art.body")}</small>
        </div>
        <Check size={18} />
      </div>
      <div class="of-art-baseline">
        <span>{text("art.footer")}</span><ArrowUpRight size={18} />
      </div>
    </div>
  </section>

  <div class="of-proofline">
    <span class="of-proof-label">{text("strip.label")}</span><span
      ><i></i>{text("strip.1")}</span
    ><span><i></i>{text("strip.2")}</span><span><i></i>{text("strip.3")}</span
    ><span><i></i>{text("strip.4")}</span>
  </div>

  <section class="of-preview-section" aria-labelledby="of-preview-title">
    <div class="of-section-heading">
      <div>
        <p class="of-eyebrow">{text("preview.label")}</p>
        <h2 id="of-preview-title">{text("preview.title")}</h2>
        <p>{text("preview.description")}</p>
      </div>
      <a class="of-text-link" href={href("/docs/guides/tickets")}
        >{text("features.link")}<ArrowUpRight size={15} /></a
      >
    </div>
    <WorkspacePreview {context} />
  </section>

  <section class="of-guides-section" aria-labelledby="of-guides-title">
    <div class="of-section-heading">
      <div>
        <p class="of-eyebrow">{text("features.kicker")}</p>
        <h2 id="of-guides-title">{text("features.title")}</h2>
        <p>{text("features.description")}</p>
      </div>
      <a class="of-text-link" href={href("/docs")}
        >{text("site.docs")}<ArrowUpRight size={15} /></a
      >
    </div>
    <div class="of-guide-grid">
      {#each guides as guide}<a class="of-guide-card" href={href(guide.path)}
          ><div class="of-guide-top">
            <svelte:component
              this={guide.icon}
              size={23}
              strokeWidth={1.8}
            /><span>{guide.number}</span>
          </div>
          <h3>{text(guide.title)}</h3>
          <p>{text(guide.body)}</p>
          <ArrowRight class="of-guide-arrow" size={18} /></a
        >{/each}
    </div>
  </section>

  <section class="of-principles" aria-labelledby="of-principles-title">
    <div class="of-principles-heading">
      <p class="of-eyebrow">{text("workflow.kicker")}</p>
      <h2 id="of-principles-title">{text("workflow.title")}</h2>
      <p>{text("workflow.description")}</p>
    </div>
    <div class="of-principles-list">
      {#each principles as principle, index}<article>
          <span class="of-principle-index">0{index + 1}</span><svelte:component
            this={principle.icon}
            size={22}
            strokeWidth={1.7}
          />
          <div>
            <h3>{text(principle.title)}</h3>
            <p>{text(principle.body)}</p>
          </div>
        </article>{/each}
    </div>
  </section>

  <section class="of-stack-section">
    <div>
      <p class="of-eyebrow">{text("providers.kicker")}</p>
      <h2>{text("providers.title")}</h2>
      <p>{text("providers.description")}</p>
    </div>
    <div class="of-stack-list">
      <div>
        <span><Sparkles size={18} /></span><strong
          >{text("providers.models")}</strong
        ><small>OpenAI · Anthropic · Google · xAI · DeepSeek</small>
      </div>
      <div>
        <span><MessageSquare size={18} /></span><strong
          >{text("providers.email")}</strong
        ><small>Resend · SendGrid · Mailgun · SMTP</small>
      </div>
      <div>
        <span><Webhook size={18} /></span><strong
          >{text("providers.notify")}</strong
        ><small>Slack · Discord · Telegram · Feishu · WeCom</small>
      </div>
    </div>
  </section>

  <section class="of-cta">
    <div>
      <p class="of-eyebrow">{text("start.kicker")}</p>
      <h2>{text("start.title")}</h2>
      <p>{text("start.description")}</p>
    </div>
    <div class="of-command">
      <div>
        <small aria-live="polite"
          >{text(
            copied
              ? "start.copied"
              : copyFailed
                ? "start.copyFailed"
                : "start.command",
          )}</small
        ><code>git clone https://github.com/backrunner/onfire.git</code>
      </div>
      <button
        type="button"
        aria-label={copied ? text("start.copied") : text("start.copy")}
        onclick={copyCommand}
        >{#if copied}<Check size={16} />{:else}<Copy size={16} />{/if}</button
      >
    </div>
  </section>
</div>
