<script lang="ts">
  import type { SvedocsThemeContext } from 'svedocs/theme/types';

  export let context: SvedocsThemeContext;
  let preview = 'tickets';
  let copied = false;

  const text = (key: string) => context.t(key);
  const href = (path: string) => {
    if (context.localeCode !== 'zh') return path;
    if (path === '/') return '/zh';
    if (path.startsWith('/docs')) return `/docs/zh${path.slice('/docs'.length)}`;
    return `/zh${path}`;
  };

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText('git clone https://github.com/backrunner/onfire.git');
      copied = true;
      window.setTimeout(() => (copied = false), 1800);
    } catch {
      copied = false;
    }
  }
</script>

<div class="onfire-landing" data-locale={context.localeCode}>
  <section class="onfire-hero" aria-labelledby="onfire-hero-title">
    <div class="onfire-hero-copy">
      <div class="onfire-eyebrow"><span></span>{text('hero.eyebrow')}</div>
      <h1 id="onfire-hero-title">{text('hero.title')}<br /><em>{text('hero.second')}</em></h1>
      <p class="onfire-hero-description">{text('hero.description')}</p>
      <div class="onfire-hero-actions">
        <a class="onfire-button onfire-button-primary" href={href('/docs')}>{text('site.guide')} <span aria-hidden="true">↗</span></a>
        <a class="onfire-button onfire-button-secondary" href="https://github.com/backrunner/onfire" rel="noreferrer" target="_blank">{text('site.source')}</a>
      </div>
      <div class="onfire-hero-meta"><i></i>{text('hero.meta')}</div>
    </div>
    <div class="onfire-hero-art" aria-label={text('preview.label')}>
      <div class="onfire-art-glow"></div>
      <div class="onfire-window onfire-window-main">
        <div class="onfire-window-top"><span class="onfire-dots"><i></i><i></i><i></i></span><span class="onfire-window-title">{text('preview.label')}</span><span class="onfire-window-menu">•••</span></div>
        <div class="onfire-dashboard">
          <aside class="onfire-dashboard-nav">
            <div class="onfire-mini-brand"><span>🔥</span> OnFire</div>
            <button class:active={preview === 'tickets'} onclick={() => (preview = 'tickets')}><b>▤</b>{text('preview.tickets')}</button>
            <button class:active={preview === 'portal'} onclick={() => (preview = 'portal')}><b>◫</b>{text('preview.portal')}</button>
            <button class:active={preview === 'routing'} onclick={() => (preview = 'routing')}><b>⌁</b>{text('preview.routing')}</button>
            <div class="onfire-nav-rule"></div>
            <small>{text('preview.product')}</small><button><b>◉</b>{text('preview.products')}</button><button><b>◎</b>{text('preview.account')}</button>
            <div class="onfire-nav-user"><span>AM</span><div><strong>{text('preview.agent')}</strong><small>{text('preview.support')}</small></div></div>
          </aside>
          <div class="onfire-dashboard-body">
            {#if preview === 'tickets'}
              <div class="onfire-dashboard-heading"><div><small>{text('preview.tickets')}</small><h2>{text('preview.open')}</h2></div><button class="onfire-small-button">＋ {text('preview.new')}</button></div>
              <div class="onfire-status-tabs"><span class="selected">{text('preview.all')} <b>24</b></span><span>{text('preview.assigned')} <b>8</b></span><span>{text('preview.replied')} <b>6</b></span></div>
              <div class="onfire-search">⌕ <span>{text('preview.search')}</span></div>
              <div class="onfire-ticket-list">
                <button class="onfire-ticket selected"><span class="onfire-ticket-status amber"></span><div><strong>{text('preview.subject1')}</strong><small>{text('preview.customer')} · {text('preview.time')}</small></div><em>{text('preview.medium')}</em></button>
                <button class="onfire-ticket"><span class="onfire-ticket-status blue"></span><div><strong>{text('preview.subject2')}</strong><small>Jordan Lee · 38 min ago</small></div><em>{text('preview.processing')}</em></button>
                <button class="onfire-ticket"><span class="onfire-ticket-status green"></span><div><strong>{text('preview.subject3')}</strong><small>Sam Rivera · 1 hr ago</small></div><em>{text('preview.replied')}</em></button>
              </div>
            {:else if preview === 'portal'}
              <div class="onfire-portal-preview"><div class="onfire-portal-mark">🔥</div><small>ACME CLOUD SUPPORT</small><h2>{text('preview.portalheading')}</h2><p>{text('preview.portalcopy')}</p><div class="onfire-portal-options"><button><b>⌁</b>{text('preview.technical')}<span>→</span></button><button><b>◈</b>{text('preview.billing')}<span>→</span></button><button><b>◇</b>{text('preview.domain')}<span>→</span></button></div></div>
            {:else}
              <div class="onfire-routing-preview"><small>{text('preview.routing')}</small><h2>{text('preview.routeheading')}</h2><p>{text('preview.routecopy')}</p><div class="onfire-route-step"><span>01</span><div><strong>{text('preview.route1')}</strong><small>Technical support</small></div></div><div class="onfire-route-line"></div><div class="onfire-route-step"><span>02</span><div><strong>{text('preview.route2')}</strong><small>3 agents · 12 {text('preview.pending')}</small></div></div><div class="onfire-route-line"></div><div class="onfire-route-step"><span>03</span><div><strong>{text('preview.route3')}</strong><small>Alex Morgan · 2 {text('preview.pending')}</small></div></div></div>
            {/if}
          </div>
        </div>
      </div>
      <div class="onfire-window onfire-window-detail"><div class="onfire-detail-top"><span class="onfire-avatar">MC</span><div><strong>{text('preview.subject1')}</strong><small>{text('preview.customer')} · #{'TK-1048'}</small></div><span class="onfire-detail-close">×</span></div><p>{text('preview.body')}</p><div class="onfire-agent-reply"><div><strong>{text('preview.agent')}</strong><small>{text('preview.time')}</small></div><p>{text('preview.reply')}</p></div><div class="onfire-detail-footer"><span>{text('preview.ai')}</span><b>✦</b></div></div>
    </div>
  </section>

  <div class="onfire-proof-strip">{#each ['strip.1', 'strip.2', 'strip.3', 'strip.4'] as key}<span><i></i>{text(key)}</span>{/each}</div>

  <section class="onfire-section onfire-workflow" id="overview"><div class="onfire-section-intro"><div class="onfire-eyebrow"><span></span>{text('workflow.kicker')}</div><h2>{text('workflow.title')}</h2><p>{text('workflow.description')}</p></div><div class="onfire-workflow-grid"><article><span class="onfire-step">01</span><h3>{text('workflow.1.title')}</h3><p>{text('workflow.1.body')}</p><div class="onfire-workflow-art onfire-art-portal"><span>⌁</span><i></i><i></i><i></i></div></article><article><span class="onfire-step">02</span><h3>{text('workflow.2.title')}</h3><p>{text('workflow.2.body')}</p><div class="onfire-workflow-art onfire-art-context"><span>◎</span><b></b><b></b><b></b></div></article><article><span class="onfire-step">03</span><h3>{text('workflow.3.title')}</h3><p>{text('workflow.3.body')}</p><div class="onfire-workflow-art onfire-art-close"><span>✓</span><b>{text('preview.replied')}</b></div></article></div></section>

  <section class="onfire-section onfire-features"><div class="onfire-section-intro"><div class="onfire-eyebrow"><span></span>{text('features.kicker')}</div><h2>{text('features.title')}</h2></div><div class="onfire-feature-grid"><article><span class="onfire-feature-icon">⌘</span><h3>{text('features.access.title')}</h3><p>{text('features.access.body')}</p><a href={href('/docs/guides/access')}>{text('features.link')} <span>→</span></a></article><article><span class="onfire-feature-icon">▥</span><h3>{text('features.forms.title')}</h3><p>{text('features.forms.body')}</p><a href={href('/docs/guides/tickets')}>{text('features.link')} <span>→</span></a></article><article><span class="onfire-feature-icon">✦</span><h3>{text('features.ai.title')}</h3><p>{text('features.ai.body')}</p><a href={href('/docs/guides/ai')}>{text('features.link')} <span>→</span></a></article><article><span class="onfire-feature-icon">⌁</span><h3>{text('features.auto.title')}</h3><p>{text('features.auto.body')}</p><a href={href('/docs/guides/automation')}>{text('features.link')} <span>→</span></a></article></div></section>

  <section class="onfire-section onfire-providers"><div class="onfire-provider-copy"><div class="onfire-eyebrow"><span></span>{text('providers.kicker')}</div><h2>{text('providers.title')}</h2><p>{text('providers.description')}</p></div><div class="onfire-provider-list"><div><span class="onfire-provider-mark">◌</span><strong>{text('providers.models')}</strong><small>OpenAI · Anthropic · Google · xAI · DeepSeek</small></div><div><span class="onfire-provider-mark">✉</span><strong>{text('providers.email')}</strong><small>Resend · SendGrid · Mailgun · SMTP</small></div><div><span class="onfire-provider-mark">◎</span><strong>{text('providers.notify')}</strong><small>Slack · Discord · Telegram · Feishu · WeCom</small></div></div></section>

  <section class="onfire-start"><div><div class="onfire-eyebrow"><span></span>{text('start.kicker')}</div><h2>{text('start.title')}</h2><p>{text('start.description')}</p></div><div class="onfire-command"><div><small>{text('start.command')}</small><code>git clone https://github.com/backrunner/onfire.git</code></div><button aria-label={copied ? text('start.copied') : text('start.copy')} onclick={copyCommand}>{copied ? '✓' : '⧉'}</button></div></section>
</div>
