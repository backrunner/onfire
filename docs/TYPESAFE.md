# TypeSafe / Jev screening

OnFire supports TypeSafe's Jev System One models for **Ticket Prescreening**.
The provider uses `POST https://api.typesafe.ai/v1/systemone` with Bearer
authentication and typed questions; it is not an OpenAI-compatible chat API.

## Configuration

1. In the appropriate system, tenant, or product AI configuration, add a
   **TypeSafe (Jev)** credential and its API key. The default base URL is
   `https://api.typesafe.ai/v1`. Keys use the existing encrypted credential pool.
2. Add that credential to **Ticket Prescreening**. Refresh the model list or
   choose `jev-latest`; pin `jev-1.13.0` when calibrating against a fixed version.
   The live `/v1/models` catalog currently lists aliases; pinned Jev version IDs
   are also supported. Optional gateways must use the same TypeSafe protocol.
3. Put an existing language-model credential later in the same route if desired.
   Both directions of failover are supported. Scoped inheritance, cooldowns,
   usage attribution and disabled credentials work as for other AI providers.
   Name, enable/disable and cooldown edits remain available during provider
   outages. Key/provider/endpoint changes revalidate existing route models;
   catalog failures do not replace the saved key.
4. Enable the product's email AI filter to apply screening to new inbound email.
   Local spam checks and an optional external spam filter still run first.

The TypeSafe provider is unavailable for assistant, pre-reply, translation,
embedding and reranking tasks. Task capability checks apply in the API and at
runtime, including credential edits and inherited routes.

## Results and policy

Each request batches independent spam/support Noul questions, category,
sentiment and urgency Choices, and one Noul per fixed support tag. New inbound
email also selects from the product's complete supplied ticket-type candidates,
with an explicit no-match option. Candidate IDs are resolved locally from the
selected option. No candidates are silently dropped.

- Tags: `account`, `billing`, `technical`, `performance`, `data`, `security`,
  `feature_request`, `how_to`. A tag requires probability at least 0.75.
- Category, sentiment and urgency require Choice confidence at least 0.7.
  These speculative support insights are used only when support probability is
  above 0.5 and spam probability below 0.5.
- Email rejection compares spam probability and `1 - supportProbability`
  independently with the existing product strictness thresholds: low 0.9,
  medium 0.75, high 0.5. An exact 0.5 tie does not reject. Rejected mail stays
  in the existing recoverable quarantine.
- Ticket-type selection retains the existing 0.7 confidence gate. No match or
  insufficient confidence uses the product's unclassified type.
- Jev does not generate summaries, free-form issue descriptions or novel
  keywords. Those fields remain absent/empty; fixed tags populate AI keywords.
  Use a language model as the primary route when generated prose is required.
- Raw typed answers/probabilities and the returned model version are stored in
  screening audit JSON. Successful usage records use the returned model version
  and actual input/output token counts. Customer projections expose no AI data.

HTTP errors (including 429/529), invalid JSON, missing answers, invalid
probabilities or choices, timeout and oversized responses fail the credential
attempt. The route tries its next available credential and applies its normal
cooldown policy; the adapter performs no immediate retry loop. If every email
screening provider fails, email intake retains its existing best-effort behavior.

Requests use a 20-second timeout and a 256 KiB response limit. Conservative
UTF-8 budgets are 24,000 bytes of state, 30,000 bytes for state plus the longest
question, and 48,000 bytes overall. At most 254 ticket-type candidates plus
no-match fit Jev's documented 255-choice limit. Oversized inputs fail over;
they are not silently truncated by this adapter. The email pipeline retains
its pre-existing 8,000-character body limit.

## Official references and evaluation

Checked against the live documentation on 2026-09-19:

- [HTTP API](https://docs.typesafe.ai/api)
- [Models and limits](https://docs.typesafe.ai/models)
- [Noul](https://docs.typesafe.ai/primitives/noul),
  [Choice](https://docs.typesafe.ai/primitives/choice),
  [confidence](https://docs.typesafe.ai/confidence)
- [Guardrail cookbook](https://docs.typesafe.ai/cookbooks/llm_guardrails)
- [Installed project skill](../.agents/skills/typesafe-ai/SKILL.md)

At verification time `jev-latest` and `jev-preview` point to `jev-1.13.0`.
The published price is $0.042 per million input tokens; output tokens are free.
Prices, aliases and rate limits can change. The docs describe English as the
strongest language; Chinese is supported but needs domain evaluation.

Automated tests use protocol fixtures and migrated local SQLite. They verify
mapping, isolation, routing and failure behavior, not Jev's classification
accuracy. Evaluate representative labeled English/Chinese support, spam,
phishing reports, mixed-topic, no-match and ambiguous messages before tuning
thresholds or enabling production rejection. No live TypeSafe key or model call
is required to build or run the deterministic tests.
