# ToB Design Standards

## Direction

Build a quiet operational console: zinc neutrals, restrained semantic color, compact density, and predictable workflows. Modern polish comes from precise spacing, subtle borders, shallow shadows, and limited gradients.

Avoid generic AI-dashboard composition: no oversized headings inside operational panels, repeated decorative cards, gradient blobs, glass-heavy shells, or prose explaining obvious controls. Visual interest must reinforce hierarchy or state.

## Layout

- Page title blocks use `text-xl` and sit 16px from the next control group.
- New operational cards use at most 8px radius unless the existing primitive requires otherwise.
- Dense forms remove the default Card gap: `gap-0 py-0`, 16px header, 16px bottom content inset.
- Grid siblings use stretch alignment and `h-full`; empty/error/loading states share a stable minimum height.
- When two modules share a row, their outer panels and empty bodies align to the same height at every breakpoint; content changes must not resize only one side.
- Do not nest cards. Use borders, separators, or full-width bands internally.
- Use stable control dimensions so dynamic content does not shift layout.

## Components

- Start from existing shadcn/ui and zinc tokens.
- Use lucide icons for tools; unfamiliar icon-only actions need labels and tooltips/titles.
- Use segmented icon controls for preview modes, switches for binary state, Select for finite options, and text buttons for commands.
- Empty Select never appears blank; render a disabled labeled boundary state.
- Editing remains available for every mutable row; visually separate destructive actions.
- Management row actions use a discoverable edit affordance. Keep create actions at section level and destructive actions in a separated menu or confirmed dialog.
- Email template preview uses stable desktop/mobile segmented controls and a fixed sandboxed viewport; editor and preview heights should not jump when switching templates.

## Color And Effects

- Zinc is the base, not the only color. Use emerald, amber, red, sky, and small orange brand accents semantically.
- Reserve gradients for small brand/active accents. No decorative blobs, glow fields, or large gradient backgrounds.
- Prefer `shadow-xs`/`shadow-sm`; menus and dialogs may use stronger elevation.
- Preserve equivalent hierarchy and contrast in light and dark mode.

## Interaction

- Search suggestion click navigates directly; Enter opens broad search.
- Prefetch likely routes and avoid unnecessary server navigation.
- Search suggestions show a stable ticket identifier plus subject/customer context, support keyboard highlight/selection, and expose clear loading, no-result, and error states.
- Keep dialog actions stable and expose unsaved/disabled states.
- Sandbox HTML preview and offer desktop/mobile widths without shifting editor layout.
- Theme rendering is SSR-safe: `onfire-theme=light|dark` is the shared source for server markup and client hydration; first-visit system preference is applied before paint, with no light-to-dark flash.
- Turnstile-protected actions reserve widget space and remain disabled until a token exists; expiry or retry resets the token without shifting the surrounding form.
