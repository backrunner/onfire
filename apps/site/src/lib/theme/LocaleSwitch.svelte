<script lang="ts">
  import { page as currentPage } from "$app/stores";
  import { onMount } from "svelte";
  import { Languages } from "@lucide/svelte";
  import { resolveSvedocsHref } from "svedocs/routes";
  import type { SvedocsPage } from "svedocs/core";
  import type { SvedocsThemeContext } from "svedocs/theme/types";
  import pageLoaders from "virtual:svedocs/page-loaders";

  export let context: SvedocsThemeContext;
  let mounted = false;
  let alternate: SvedocsPage | undefined;
  let generation = 0;
  onMount(() => {
    mounted = true;
  });
  $: target = context.config.i18n.locales.find(
    (locale) => locale.code !== context.localeCode,
  );
  $: translation = target
    ? resolveSvedocsHref({
        href: context.page?.scopePath ?? "/",
        pages: context.pages,
        config: context.config,
        localeCode: target.code,
      })
    : undefined;
  $: available = Boolean(
    translation?.page &&
    !translation.fallback &&
    translation.page.locale === target?.code,
  );
  $: loadHeadings(
    available ? translation?.page?.id : undefined,
    mounted ? $currentPage.url.hash : "",
  );
  async function loadHeadings(id: string | undefined, hash: string) {
    const request = ++generation;
    alternate = undefined;
    if (!id || !hash) return;
    try {
      const module = await pageLoaders[id]?.();
      if (generation === request) alternate = module?.default;
    } catch {
      /* The translated article remains available without its section. */
    }
  }
  function translatedHash(
    hash: string,
    source: SvedocsPage | undefined,
    translated: SvedocsPage | undefined,
  ) {
    if (!hash || !source) return "";
    if (source.scopePath === "/") return hash;
    if (!translated) return "";
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return "";
    }
    const match = translated.headings.find((h) => h.id === id);
    if (match) return `#${encodeURIComponent(match.id)}`;
    const index = source.headings.findIndex((h) => h.id === id);
    const paired =
      source.headings.length === translated.headings.length &&
      source.headings.every(
        (h, i) => h.depth === translated.headings[i]?.depth,
      );
    return paired && index >= 0
      ? `#${encodeURIComponent(translated.headings[index].id)}`
      : "";
  }
  $: hash = mounted
    ? translatedHash($currentPage.url.hash, context.page, alternate)
    : "";
  $: href = `${translation?.href ?? "/"}${mounted ? $currentPage.url.search : ""}${hash}`;
</script>

{#if target}
  <a
    class="of-locale"
    href={available ? href : undefined}
    aria-disabled={!available || undefined}
    hreflang={target.hreflang ?? target.code}
    aria-label={target.label}
    title={target.label}
  >
    <Languages size={16} /><span>{target.code === "zh" ? "中" : "EN"}</span>
  </a>
{/if}
