# Design Reference

- Use existing shadcn/ui primitives and zinc tokens.
- Favor a dense operational console over marketing composition.
- Avoid AI-dashboard slop: no oversized operational headings, decorative card grids, gradient blobs, glass-heavy shells, or explanatory UI copy.
- Page title to content: 16px. Dense card header to body: no implicit card gap; use 16px internal padding.
- Cards: maximum 8px radius in new UI unless the existing primitive dictates otherwise; no nested cards.
- Grid siblings: `h-full`, stretch alignment, and equal minimum heights for loading/empty/error states.
- Paired modules keep equal outer and empty-body heights across breakpoints.
- Empty Select: show a disabled, labeled state instead of an empty menu.
- Actions: icons for familiar tools, labeled create/save commands, row menu for secondary/destructive actions.
- Color: zinc base plus restrained emerald/amber/red/sky and small orange brand accents.
- Effects: shallow shadows, subtle borders, rare small gradients; no decorative blobs or glass-heavy panels.
- Search: click a suggestion to navigate directly; Enter opens full results.
- Protected ToC actions reserve Turnstile space and reset expired tokens without layout shift.
- Verify 1440x900 and 390x844, light and dark when supported.
