<script lang="ts">
  import { onMount } from "svelte";
  import { Moon, Sun } from "@lucide/svelte";
  import {
    createThemeModeController,
    fallbackTranslate,
  } from "svedocs/theme/headless";
  import type { SvedocsThemeToggleProps } from "svedocs/theme/types";

  export let context: SvedocsThemeToggleProps["context"];
  const controller = createThemeModeController("system");
  let mode: "light" | "dark" = "light";
  $: t = context?.t ?? fallbackTranslate;
  $: label = t("theme.switch", {
    mode: t(mode === "dark" ? "theme.light" : "theme.dark"),
  });

  onMount(() => {
    const unsubscribe = controller.mode.subscribe((value) => (mode = value));
    const unmount = controller.mount();
    return () => {
      unsubscribe();
      unmount();
    };
  });
</script>

<button
  class="of-icon-button"
  type="button"
  aria-label={label}
  title={label}
  onclick={controller.toggle}
>
  {#if mode === "dark"}<Sun size={17} strokeWidth={1.8} />{:else}<Moon
      size={17}
      strokeWidth={1.8}
    />{/if}
</button>
