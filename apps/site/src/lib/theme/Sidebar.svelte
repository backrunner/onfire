<script lang="ts">
  import { useSvedocsTheme } from "svedocs/theme/headless";
  import { ChevronDown } from "@lucide/svelte";
  import { tick } from "svelte";
  import type { SvedocsSidebarProps } from "svedocs/theme/types";
  import type { SvedocsTreeItem } from "svedocs/core";

  export let items: SvedocsSidebarProps["items"] = [];
  export let currentPath = "";
  export let depth = 0;
  export let visible = true;

  let root: HTMLDivElement | undefined;

  const theme = useSvedocsTheme();
  const normalize = (path?: string) => path?.replace(/\/$/, "");
  $: activePath = normalize(currentPath);
  const isActive = (item: SvedocsTreeItem) =>
    normalize(item.path) === activePath;
  const hasActive = (item: SvedocsTreeItem): boolean =>
    isActive(item) || Boolean(item.children?.some(hasActive));

  // Route changes and opening the mobile menu must reveal the active chapter
  // within navigation, without moving the article or browser history position.
  async function revealCurrent(path: string, _items: typeof items) {
    await tick();
    if (!root?.isConnected || !visible || normalize(path) !== activePath) return;
    const link = root.querySelector<HTMLElement>('[aria-current="page"]');
    const scroller = root.closest<HTMLElement>(
      ".of-docs-sidebar, .of-mobile-menu",
    );
    if (!link || !scroller?.clientHeight) return;
    const itemBounds = link.getBoundingClientRect();
    const bounds = scroller.getBoundingClientRect();
    const top = bounds.top + scroller.clientTop + 12;
    const bottom = bounds.top + scroller.clientTop + scroller.clientHeight - 12;
    if (itemBounds.top < top) scroller.scrollTop += itemBounds.top - top;
    else if (itemBounds.bottom > bottom)
      scroller.scrollTop += itemBounds.bottom - bottom;
  }

  $: if (root && visible) void revealCurrent(currentPath, items);
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

<div bind:this={root}>
  {@render branch(items ?? [], depth)}
</div>
