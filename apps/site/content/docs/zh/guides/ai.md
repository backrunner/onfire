---
title: AI 与知识库
description: 接入模型服务商，同时保留范围、故障切换和审计能力。
order: 5
---

语言任务支持 OpenAI、OpenRouter、Anthropic、Google、xAI 和 DeepSeek。Embedding 支持 OpenAI、OpenRouter、Qwen、Jina、Cohere 和 Google；Rerank 支持 Cohere 和 Jina。

凭据保存在加密池中，每个任务通过有序的模型/凭据组合路由请求。服务商失败时会切换到下一个可用路由。每次调用都会记录系统、租户和产品维度的用量。

知识向量使用绑定的 Vectorize 索引维度。产品知识按范围隔离，D1 回退保证待处理或暂时不可用的向量仍能参与检索。依赖 AI 的功能只有在存在启用路由时才能开启。
