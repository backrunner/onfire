<script lang="ts">
  import { useSvedocsTheme } from "svedocs/theme/headless";
  import { ChevronDown } from "@lucide/svelte";
  import type { SvedocsSidebarProps } from "svedocs/theme/types";
  import type { SvedocsTreeItem } from "svedocs/core";

  export let items: SvedocsSidebarProps["items"] = [];
  export let currentPath = "";
  export let depth = 0;

  const theme = useSvedocsTheme();
  const normalize = (path?: string) => path?.replace(/\/$/, "");
  $: activePath = normalize(currentPath);
  const isActive = (item: SvedocsTreeItem) =>
    normalize(item.path) === activePath;
  const hasActive = (item: SvedocsTreeItem): boolean =>
    isActive(item) || Boolean(item.children?.some(hasActive));
</script>

{#snippet branch(nodes: SvedocsTreeItem[], level: number)}
  <ul class="of-sidebar-list" data-depth={level}>
    {#each nodes as item (item.id)}
      <li>
        {#if item.children?.length}
          <details
            class="of-sidebar-group"
            open={hasActive(item) || !item.collapsed}
          >
            <summary
              ><span
                >{item.title === "Start"
                  ? $theme.t("sidebar.start")
                  : item.title === "Guides"
                    ? $theme.t("sidebar.guides")
                    : item.title}</span
              ><ChevronDown size={14} strokeWidth={1.8} /></summary
            >
            {#if item.path}
              <a
                class="of-sidebar-link"
                href={item.path}
                aria-current={isActive(item) ? "page" : undefined}
                >{$theme.t("sidebar.overview")}</a
              >
            {/if}
            {@render branch(item.children, level + 1)}
          </details>
        {:else if item.path}
          <a
            class="of-sidebar-link"
            href={item.path}
            aria-current={isActive(item) ? "page" : undefined}>{item.title}</a
          >
        {:else}
          <span class="of-sidebar-label">{item.title}</span>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{@render branch(items ?? [], depth)}
