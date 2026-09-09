<script lang="ts">
  import { ArrowUpRight, Code2, Menu, Search, X } from "@lucide/svelte";
  import SearchDialog from "./SearchDialog.svelte";
  import {
    resolveLocalizedHref,
    resolveLocalizedText,
  } from "svedocs/theme/headless";
  import type { SvedocsNavbarProps } from "svedocs/theme/types";
  import BrandMark from "./BrandMark.svelte";
  import Sidebar from "./Sidebar.svelte";
  import LocaleSwitch from "./LocaleSwitch.svelte";
  import ThemeToggle from "./ThemeToggle.svelte";

  export let context: SvedocsNavbarProps["context"];
  export let mobileTree: SvedocsNavbarProps["mobileTree"] = [];
  export let mobileCurrentPath = "";
  export let mobileMenuId = "onfire-mobile-menu";
  export let mobileMenuOpen = false;
  export let onToggleMobileMenu: SvedocsNavbarProps["onToggleMobileMenu"];
  export let onCloseMobileMenu: SvedocsNavbarProps["onCloseMobileMenu"];

  const href = (path: string) => resolveLocalizedHref(path, context);
</script>

<header class="of-header">
  <div class="of-navbar">
    <a href={href("/")} class="of-brand" aria-label={context.t("brand.home")}
      ><BrandMark size={35} /><span>OnFire</span></a
    >
    <nav class="of-topnav" aria-label={context.t("nav.primary")}>
      {#each context.config.theme.nav as item (item.href)}
        <a
          href={href(item.href)}
          aria-current={context.activeNavHref === href(item.href)
            ? "page"
            : undefined}
          >{resolveLocalizedText(item.label, item.labelKey, context)}</a
        >
      {/each}
    </nav>
    <div class="of-nav-tools">
      <div class="of-search">
        <SearchDialog {context} />
      </div>
      <button
        class="of-icon-button of-mobile-search"
        type="button"
        aria-label={context.t("search.dialog")}
        onclick={() => window.dispatchEvent(new Event("svedocs:open-search"))}
        ><Search size={17} /></button
      >
      <LocaleSwitch {context} />
      <ThemeToggle {context} />
      <a
        class="of-icon-button of-github"
        href="https://github.com/backrunner/onfire"
        target="_blank"
        rel="noreferrer"
        aria-label="GitHub"><Code2 size={17} /></a
      >
      <button
        class="of-icon-button of-menu-button"
        type="button"
        aria-controls={mobileMenuId}
        aria-expanded={mobileMenuOpen}
        aria-label={context.t(
          mobileMenuOpen ? "nav.mobile.close" : "nav.mobile.open",
        )}
        onclick={onToggleMobileMenu}
        >{#if mobileMenuOpen}<X size={20} />{:else}<Menu
            size={20}
          />{/if}</button
      >
    </div>
  </div>
  <div id={mobileMenuId} class:of-open={mobileMenuOpen} class="of-mobile-menu">
    <nav aria-label={context.t("nav.primary")}>
      {#each context.config.theme.nav as item (item.href)}<a
          href={href(item.href)}
          onclick={onCloseMobileMenu}
          >{resolveLocalizedText(
            item.label,
            item.labelKey,
            context,
          )}<ArrowUpRight size={15} /></a
        >{/each}
    </nav>
    {#if context.isDocsPage}<nav
        class="of-mobile-docs"
        aria-label={context.t("nav.documentation")}
      >
        <Sidebar
          items={mobileTree?.length ? mobileTree : context.tree}
          currentPath={mobileCurrentPath || context.page?.routePath || ""}
        />
      </nav>{/if}
  </div>
</header>
