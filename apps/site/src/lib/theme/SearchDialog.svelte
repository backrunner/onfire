<script lang="ts">
  import { afterNavigate, goto } from "$app/navigation";
  import { onDestroy, onMount, tick } from "svelte";
  import { Search, X } from "@lucide/svelte";
  import { createSearchController } from "svedocs/theme/headless";
  import type { SvedocsThemeContext } from "svedocs/theme/types";
  export let context: SvedocsThemeContext;
  const controller = createSearchController();
  const { open, query, activeIndex, results, recordsStatus } = controller;
  let previousFocus: HTMLElement | undefined;
  let trigger: HTMLButtonElement;
  let input: HTMLInputElement;
  let shortcut = "⌘K";
  $: controller.setOptions({
    records: context.search,
    loadRecords: context.loadSearch,
    scope: { ...context.searchScope, locale: context.localeCode },
    provider: "local",
    buildMode: "static",
    t: context.t,
  });
  function show() {
    if (!$open)
      previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined;
    controller.show();
  }
  function hide() {
    controller.hide();
  }
  function composing(event: KeyboardEvent) {
    return event.isComposing || event.keyCode === 229;
  }
  function globalKey(event: KeyboardEvent) {
    if (
      !composing(event) &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "k"
    ) {
      event.preventDefault();
      show();
    }
  }
  function dialogKey(event: KeyboardEvent) {
    if (composing(event) || event.target !== input) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      controller.moveActive(event.key === "ArrowDown" ? 1 : -1);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = controller.select();
      if (result) void goto(result.url);
    }
  }
  function modal(node: HTMLDialogElement) {
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    node.showModal();
    void tick().then(() => input?.focus());
    const cancel = (event: Event) => {
      event.preventDefault();
      hide();
    };
    const outside = (event: MouseEvent) => {
      if (event.target === node) hide();
    };
    node.addEventListener("cancel", cancel);
    node.addEventListener("click", outside);
    return {
      destroy() {
        node.removeEventListener("cancel", cancel);
        node.removeEventListener("click", outside);
        node.close();
        root.style.overflow = overflow;
        (previousFocus ?? trigger)?.focus({ preventScroll: true });
      },
    };
  }
  afterNavigate(hide);
  onMount(() => {
    shortcut = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K";
    window.addEventListener("keydown", globalKey);
    window.addEventListener("svedocs:open-search", show);
    return () => {
      window.removeEventListener("keydown", globalKey);
      window.removeEventListener("svedocs:open-search", show);
    };
  });
  onDestroy(() => controller.destroy?.());
</script>

<button
  bind:this={trigger}
  class="sd-search-trigger"
  type="button"
  aria-label={context.t("search.dialog")}
  aria-haspopup="dialog"
  aria-expanded={$open}
  onclick={show}
  ><span>{context.t("search.trigger")}</span><kbd>{shortcut}</kbd></button
>
{#if $open}
  <dialog
    use:modal
    class="sd-search-dialog"
    aria-label={context.t("search.dialog")}
    aria-modal="true"
    onkeydown={dialogKey}
  >
    <div class="of-search-heading">
      <Search size={18} aria-hidden="true" /><label class="sd-search-box"
        ><span class="sd-visually-hidden">{context.t("search.query")}</span
        ><input
          bind:this={input}
          value={$query}
          placeholder={context.t("search.placeholder")}
          role="combobox"
          aria-autocomplete="list"
          aria-controls="onfire-search-results"
          aria-expanded="true"
          oninput={(event) => controller.setQuery(event.currentTarget.value)}
        /></label
      ><button
        class="of-icon-button"
        type="button"
        aria-label={context.t("search.close")}
        onclick={hide}><X size={18} /></button
      >
    </div>
    <div
      id="onfire-search-results"
      class="sd-search-results"
      role="listbox"
      aria-label={context.t("search.results")}
    >
      {#if $recordsStatus === "loading"}<p class="sd-empty-state" role="status">
          {context.t("search.loadingIndex")}
        </p>{:else if $results.length === 0}<p
          class="sd-empty-state"
          role="status"
        >
          {context.t("search.empty")}
        </p>{:else}{#each $results as result, index}<a
            class:sd-active={index === $activeIndex}
            href={result.url}
            role="option"
            aria-selected={index === $activeIndex}
            onmouseenter={() => controller.activate(index)}
            onclick={hide}
            ><span>{result.section ?? result.title}</span
            >{#if result.section}<small>{result.title}</small>{/if}
            <p>{result.excerpt}</p></a
          >{/each}{/if}
    </div>
  </dialog>
{/if}
