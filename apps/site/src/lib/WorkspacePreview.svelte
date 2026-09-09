<script lang="ts">
  import {
    Inbox,
    Globe2,
    GitBranch,
    ArrowRight,
    Search,
    Users,
    Clock3,
    Check,
    MessageSquare,
    ChevronDown,
  } from "@lucide/svelte";
  import type { SvedocsThemeContext } from "svedocs/theme/types";
  import BrandMark from "./theme/BrandMark.svelte";
  export let context: SvedocsThemeContext;
  const t = (key: string) => context.t(key);
  let mode = "tickets";
  let selected = 1;
  const tabs = [
    { id: "tickets", icon: Inbox },
    { id: "portal", icon: Globe2 },
    { id: "routing", icon: GitBranch },
  ];
</script>

<div class="of-demo">
  <div class="of-demo-controls">
    <div class="of-demo-tabs" role="group" aria-label={t("preview.label")}>
      {#each tabs as tab}
        <button
          type="button"
          aria-pressed={mode === tab.id}
          onclick={() => (mode = tab.id)}
        >
          <svelte:component this={tab.icon} size={16} /><span
            >{t(`preview.${tab.id}`)}</span
          >
        </button>
      {/each}
    </div>
    <span class="of-demo-caption">{t("preview.note")}</span>
  </div>
  <div class="of-workspace" aria-label={t("preview.label")}>
    <aside class="of-workspace-nav" aria-hidden="true">
      <div class="of-workspace-brand">
        <BrandMark size={26} /><b>OnFire</b><ChevronDown size={13} />
      </div>
      <div class="of-workspace-nav-label">{t("preview.product")}</div>
      <span class="current"
        ><Inbox size={15} />{t("preview.tickets")}<b>24</b></span
      >
      <span><Users size={15} />{t("preview.support")}</span>
      <div class="of-workspace-nav-label">{t("preview.products")}</div>
      <span><Globe2 size={15} />Acme Cloud</span>
      <span><GitBranch size={15} />{t("preview.routing")}</span>
      <div class="of-workspace-user">
        <span class="of-avatar">AM</span>
        <div>Alex Morgan<small>{t("preview.support")}</small></div>
      </div>
    </aside>
    <div class="of-workspace-screen">
      {#if mode === "tickets"}
        <div class="of-workspace-top">
          <span
            >{t("preview.tickets")}<span class="of-path-divider">/</span>{t(
              "preview.open",
            )}</span
          ><span class="of-demo-sample">{t("preview.sample")}</span>
        </div>
        <div class="of-inbox">
          <section class="of-inbox-list" aria-label={t("preview.open")}>
            <div class="of-inbox-heading">
              <h3>{t("preview.open")}</h3>
              <span>24</span>
            </div>
            <div class="of-inbox-filter">
              <Search size={14} /><span>{t("preview.search")}</span>
            </div>
            {#each [1, 2, 3] as id}
              <button
                class="of-ticket-row"
                type="button"
                aria-pressed={selected === id}
                onclick={() => (selected = id)}
              >
                <span class="of-ticket-meta"
                  ><span><i class:of-green={id === 3}></i>OF–{1049 - id}</span
                  ><span>{t(`preview.time${id}`)}</span></span
                >
                <strong>{t(`preview.subject${id}`)}</strong><small
                  >{t(`preview.customer${id}`)}</small
                >
                <span class="of-ticket-tags"
                  ><span
                    >{t(
                      id === 3 ? "preview.replied" : "preview.processing",
                    )}</span
                  ><span>{t("preview.technical")}</span></span
                >
              </button>
            {/each}
            <div class="of-inbox-end">{t("preview.queueend")}</div>
          </section>
          <section
            class="of-conversation"
            aria-live="polite"
            aria-label={t("preview.conversation")}
          >
            <div class="of-conversation-title">
              <span class="of-ticket-meta">OF–{1049 - selected}</span>
              <h3>{t(`preview.subject${selected}`)}</h3>
              <div>
                <span class="of-pill"
                  ><i></i>{t(
                    selected === 3 ? "preview.replied" : "preview.processing",
                  )}</span
                ><span><Clock3 size={13} />{t("preview.slatime")}</span>
              </div>
            </div>
            <div class="of-message">
              <span class="of-avatar of-avatar-customer"
                >{["MC", "JL", "SR"][selected - 1]}</span
              >
              <div>
                <header>
                  <strong>{t(`preview.customer${selected}`)}</strong><small
                    >{t(`preview.time${selected}`)}</small
                  >
                </header>
                <p>{t(`preview.body${selected}`)}</p>
              </div>
            </div>
            <div class="of-conversation-event">
              <Check size={13} /><span>{t("preview.assignedto")}</span>
            </div>
            <div class="of-message of-agent-message">
              <span class="of-avatar">AM</span>
              <div>
                <header>
                  <strong>Alex Morgan</strong><small
                    >{t("preview.agentlabel")}</small
                  >
                </header>
                <p>{t(`preview.reply${selected}`)}</p>
              </div>
            </div>
            <div class="of-conversation-footer">
              <MessageSquare size={14} /><span>{t("preview.context")}</span>
            </div>
          </section>
        </div>
      {:else if mode === "portal"}
        <div class="of-workspace-top">
          <span
            >Acme Cloud<span class="of-path-divider">/</span>{t(
              "preview.portal",
            )}</span
          ><span class="of-demo-sample">{t("preview.sample")}</span>
        </div>
        <section class="of-portal-screen">
          <BrandMark size={44} />
          <p class="of-eyebrow">ACME CLOUD</p>
          <h3>{t("preview.portalheading")}</h3>
          <p>{t("preview.portalcopy")}</p>
          <div class="of-portal-options">
            {#each ["technical", "billing", "domain"] as topic}<div>
                <MessageSquare size={17} /><strong
                  >{t(`preview.${topic}`)}</strong
                ><span>{t("preview.tickettype")}</span>
              </div>{/each}
          </div>
          <small>{t("preview.portalnote")}</small>
        </section>
      {:else}
        <div class="of-workspace-top">
          <span
            >{t("preview.products")}<span class="of-path-divider">/</span>{t(
              "preview.routing",
            )}</span
          ><span class="of-demo-sample">{t("preview.sample")}</span>
        </div>
        <section class="of-routing-screen">
          <p class="of-eyebrow">{t("preview.routing")}</p>
          <h3>{t("preview.routeheading")}</h3>
          <p>{t("preview.routecopy")}</p>
          <ol>
            {#each [1, 2, 3] as step}<li>
                <span>0{step}</span>
                <div>
                  <h4>{t(`preview.route${step}`)}</h4>
                  <p>{t(`preview.routedetail${step}`)}</p>
                </div>
                <svelte:component this={tabs[step - 1].icon} size={20} />
              </li>{/each}
          </ol>
        </section>
      {/if}
    </div>
  </div>
</div>
