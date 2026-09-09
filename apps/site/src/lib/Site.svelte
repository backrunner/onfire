<script lang="ts">
  import { DocsApp } from "svedocs/theme";
  import type { SvedocsAppProps } from "svedocs/theme/types";
  import themeComponents from "virtual:svedocs/theme-components";
  import loadSearch from "virtual:svedocs/search-loader";
  import Landing from "./Landing.svelte";
  export let data: SvedocsAppProps;
</script>

<DocsApp {...data} {themeComponents} {loadSearch}>
  <svelte:fragment slot="landing" let:context
    ><Landing {context} /></svelte:fragment
  >
  <svelte:fragment slot="doc-header" let:page let:breadcrumbs>
    <header class="of-doc-header">
      <nav
        class="of-breadcrumbs"
        aria-label={page.locale === "zh" ? "面包屑导航" : "Breadcrumb"}
      >
        {#each breadcrumbs as item, i}
          {#if i > 0}<span aria-hidden="true">/</span>{/if}
          <a href={item.path}>{item.label}</a>
        {/each}
      </nav>
      <div class="of-doc-label">
        {page.locale === "zh" ? "ONFIRE / 使用手册" : "ONFIRE / HANDBOOK"}
      </div>
      <h1>{page.title}</h1>
      {#if page.description}<p>{page.description}</p>{/if}
    </header>
  </svelte:fragment>
</DocsApp>
