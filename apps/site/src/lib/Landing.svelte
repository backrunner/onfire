<script lang="ts">
  import { ArrowRight, ArrowUpRight, Check, Copy } from "@lucide/svelte";
  import { onDestroy } from "svelte";
  import { resolveLocalizedHref } from "svedocs/theme/headless";
  import type { SvedocsThemeContext } from "svedocs/theme/types";
  import WorkspacePreview from "./WorkspacePreview.svelte";

  export let context: SvedocsThemeContext;
  let copied = false;
  let copyFailed = false;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(copyTimer));
  const text = (key: string) => context.t(key);
  const href = (path: string) => resolveLocalizedHref(path, context);
  const entries = ["quickstart", "deployment", "customer-portal"];
  const guides = ["tickets", "access", "forms", "email", "ai", "automation"];

  async function copyCommand() {
    clearTimeout(copyTimer);
    copyFailed = false;
    try {
      await navigator.clipboard.writeText("git clone https://github.com/backrunner/onfire.git");
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
      <h1 id="of-hero-title">{text("hero.title")}<br />{text("hero.second")}</h1>
      <p class="of-hero-description">{text("hero.description")}</p>
      <div class="of-actions">
        <a class="of-button of-button-primary" href={href("/docs/start/quickstart")}
          >{text("site.guide")}<ArrowRight size={16} /></a>
        <a class="of-text-link" href="https://github.com/backrunner/onfire" target="_blank" rel="noreferrer"
          >{text("site.source")}<ArrowUpRight size={15} /></a>
      </div>
    </div>
    <nav class="of-entry-nav" aria-labelledby="of-entry-title">
      <h2 id="of-entry-title">{text("entry.title")}</h2>
      {#each entries as entry}
        <a href={href(entry === "customer-portal" ? `/docs/guides/${entry}` : `/docs/start/${entry}`)}>
          <div><h3>{text(`entry.${entry}.title`)}</h3><p>{text(`entry.${entry}.body`)}</p></div>
          <ArrowRight size={17} />
        </a>
      {/each}
    </nav>
  </section>

  <section class="of-preview-section" aria-labelledby="of-preview-title">
    <div class="of-section-heading">
      <h2 id="of-preview-title">{text("preview.title")}</h2>
      <a class="of-text-link" href={href("/docs/guides/tickets")}>{text("features.link")}<ArrowUpRight size={15} /></a>
    </div>
    <WorkspacePreview {context} />
  </section>

  <section class="of-guides-section" aria-labelledby="of-guides-title">
    <div class="of-section-heading">
      <div><h2 id="of-guides-title">{text("features.title")}</h2><p>{text("features.description")}</p></div>
      <a class="of-text-link" href={href("/docs")}>{text("features.all")}<ArrowRight size={15} /></a>
    </div>
    <div class="of-guide-list">
      {#each guides as guide}
        <a class="of-guide" href={href(`/docs/guides/${guide}`)}>
          <div><h3>{text(`guide.${guide}.title`)}</h3><p>{text(`guide.${guide}.body`)}</p></div>
          <ArrowUpRight size={17} />
        </a>
      {/each}
    </div>
  </section>

  <section class="of-start" aria-labelledby="of-start-title">
    <div><h2 id="of-start-title">{text("start.title")}</h2><p>{text("start.description")}</p>
      <a class="of-text-link" href={href("/docs/start/deployment")}>{text("site.deploy")}<ArrowRight size={15} /></a>
    </div>
    <div class="of-command">
      <div><small aria-live="polite">{text(copied ? "start.copied" : copyFailed ? "start.copyFailed" : "start.command")}</small>
        <code>git clone https://github.com/backrunner/onfire.git</code></div>
      <button type="button" aria-label={copied ? text("start.copied") : text("start.copy")} onclick={copyCommand}>
        {#if copied}<Check size={16} />{:else}<Copy size={16} />{/if}
      </button>
    </div>
  </section>
</div>
