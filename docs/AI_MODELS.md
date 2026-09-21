# AI model suggestions and discovery

The routing model selector starts with the suggestions in
`src/components/admin/ai/provider-presets.ts`. Opening or refreshing it requests
the selected credential's live catalog. Suggestions are not evidence that a key
has been verified. Existing saved route model IDs are never migrated when the
suggestions change; a failed refresh retains the selection and previous list.

Language model suggestions were refreshed on **2026-09-21** using:

- [OpenAI models](https://developers.openai.com/api/docs/models/):
  `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-6-astra`.
- [OpenRouter live catalog](https://openrouter.ai/api/v1/models): current
  OpenAI, Google, DeepSeek, Anthropic and xAI model IDs. OpenRouter uses dotted
  `anthropic/claude-fable-5.1`; Anthropic's own API uses `claude-fable-5-1`.
- [Anthropic models](https://platform.claude.com/docs/en/about-claude/models/overview):
  Sonnet 5, Opus 5, Fable 5.1 and Haiku 4.5.
- [Google models](https://ai.google.dev/gemini-api/docs/models):
  `gemini-3.8-flash` and `gemini-3.5-flash-lite`.
- [xAI models](https://docs.x.ai/developers/models): `grok-4.7`.
- [DeepSeek models](https://api-docs.deepseek.com/quick_start/pricing):
  `deepseek-flash` and `deepseek-v4-pro`.
- [TypeSafe models](https://docs.typesafe.ai/models): `jev-latest`,
  `jev-preview` and the supported pinned version `jev-1.13.0` remain current.

These are selectable suggestions, not a guarantee of account-specific access
or an evaluation of model quality. Embedding dimensions and task capabilities
continue to be validated independently by the server.

Catalog requests and TypeSafe screening run on Cloudflare Workers. Use
`redirect: "manual"`, then reject non-2xx responses; Workers rejects
`redirect: "error"` before sending the request. Never follow a catalog redirect
with the saved API key. Error responses report HTTP status without returning
upstream bodies that might echo credentials. TypeSafe additionally distinguishes
timeouts, connection failures and invalid/empty catalogs, with one bounded retry
for temporary network/server failures. Long `Retry-After` periods are left to
the caller instead of holding the refresh request open.
