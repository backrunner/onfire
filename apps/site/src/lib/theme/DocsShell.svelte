<script lang="ts">
  import { Article, TableOfContents } from "svedocs/theme";
  import { ArrowUpRight } from "@lucide/svelte";
  import type { SvedocsDocsShellProps } from "svedocs/theme/types";
  import Sidebar from "./Sidebar.svelte";

  export let page: SvedocsDocsShellProps["page"];
  export let navigationTree: SvedocsDocsShellProps["navigationTree"] = [];
  export let content: SvedocsDocsShellProps["content"];
  export let context: SvedocsDocsShellProps["context"];
  export let tocController: SvedocsDocsShellProps["tocController"];
  export let hasDocHeaderSlot = false;
  export let themeComponents: SvedocsDocsShellProps["themeComponents"] = {};
</script>

<div class="of-docs-layout">
  <aside class="of-docs-sidebar" aria-label={context.t("nav.documentation")}>
    <div class="of-sidebar-heading">
      {context.t("docs.handbook")}
    </div>
    <nav><Sidebar items={navigationTree} currentPath={page.routePath} /></nav>
    <div class="of-sidebar-help">
      <a
        href="https://github.com/backrunner/onfire/issues"
        target="_blank"
        rel="noreferrer"
        >{context.t("docs.feedback")}<ArrowUpRight size={13} /></a
      >
    </div>
  </aside>
  <TableOfContents {page} controller={tocController} {context} />
  <main id="content" class="of-docs-main">
    <Article {page} {content} {context} {hasDocHeaderSlot} {themeComponents}>
      <svelte:fragment slot="doc-header" let:page let:breadcrumbs>
        <slot name="doc-header" {page} {breadcrumbs} />
      </svelte:fragment>
    </Article>
  </main>
</div>
