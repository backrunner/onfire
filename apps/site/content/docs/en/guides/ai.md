---
title: AI and knowledge
description: Add model providers without losing scope, fallback, or auditability.
order: 5
---

Language routes support OpenAI, OpenRouter, Anthropic, Google, xAI, and DeepSeek. Embeddings support OpenAI, OpenRouter, Qwen, Jina, Cohere, and Google; reranking supports Cohere and Jina.

Credentials live in an encrypted pool and task routes choose an ordered model/credential pair. Failed providers fall through to the next eligible route. Every call records usage at system, tenant, and product dimensions.

Knowledge vectors use the dimension of the bound Vectorize index. Product knowledge is scoped, and a D1 fallback keeps pending or temporarily unavailable vectors useful. AI-dependent features stay disabled until an enabled route exists.
