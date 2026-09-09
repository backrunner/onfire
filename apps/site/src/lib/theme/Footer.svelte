<script lang="ts">
  import { ArrowUpRight, Code2 } from "@lucide/svelte";
  import { resolveLocalizedHref } from "svedocs/theme/headless";
  import type { SvedocsFooterProps } from "svedocs/theme/types";
  import BrandMark from "./BrandMark.svelte";

  export let context: SvedocsFooterProps["context"];
</script>

<footer class="of-footer">
  <div class="of-footer-top">
    <a class="of-footer-brand" href={resolveLocalizedHref("/", context)}>
      <BrandMark size={31} /><span>OnFire</span>
    </a>
    <p>{context.t("footer.description")}</p>
    <nav aria-label={context.t("nav.footer")}>
      <a href={resolveLocalizedHref("/docs", context)}
        >{context.localeCode === "zh" ? "文档" : "Documentation"}</a
      >
      <a
        href="https://github.com/backrunner/onfire"
        target="_blank"
        rel="noreferrer"><Code2 size={14} />GitHub</a
      >
      <a href="/llms.txt" target="_blank" rel="noreferrer"
        >llms.txt<ArrowUpRight size={13} /></a
      >
    </nav>
  </div>
  <div class="of-footer-bottom">
    <span
      >© 2026 BackRunner &amp; contributors · <a
        href="https://github.com/backrunner/onfire/blob/main/LICENSE"
        >Apache 2.0</a
      ></span
    >
    <a href="https://svedocs.dev">{context.t("footer.platform")}</a>
  </div>
</footer>
