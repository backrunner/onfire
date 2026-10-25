---
title: 反垃圾与接口规范
description: 验证真实工单意图，接入 decision 模型和自定义过滤接口。
order: 6
---

OnFire 判断的是**是否为真实工单沟通**。推广广告、销售或合作邀约、钓鱼、
垃圾信息、自动通知、乱码、无意义填充和无关内容都应拦截。真实求助、问题报告、
产品咨询、投诉、功能请求和有效反馈，即使简短、情绪强烈或引用垃圾内容作为证据，
也属于有效沟通。已有工单的相关补充、请求的资料、解决确认和感谢可以通过；
仅带有工单编号不能证明内容真实。

## 配置

先应用 `0034_decision_spam.sql` 和 `0035_genuine_support_label.sql`。
在 AI 功能路由的「AI 反垃圾」中配置 TypeSafe、Hugging Face 或 Decision HTTP
凭据，然后在全局或租户反垃圾设置中选择「AI decision 模型」。凭据加密保存，
路由按产品 → 租户 → 系统继承，支持有序故障切换。不会自动启用任何模型。

过滤在客户新工单及回复写入前执行，覆盖网页/API 提交和入站邮件。
内部工作人员的备注和回复不经过此客户输入过滤。反垃圾设为禁用时不执行过滤。

拒绝分数为 `max(spamProbability, 1 - supportProbability)`。
只有垃圾概率低于 `0.5`、真实工单概率高于 `0.5`，且分数低于可疑阈值时才能通过。
默认非真实工单阈值为 `0.9`，可疑阈值为 `0.5`；前者区分明确拒绝与存疑拒绝，
不是是否接收的分界。**垃圾和可疑都会拦截**：邮件进入隔离区等待人工审核/放行，
网页/API 返回 HTTP 400，不创建工单或回复。路由全部失败、模型响应无效、验证服务
不可用时，邮件同样隔离，网页/API 返回 HTTP 503。

## 审核和恢复被过滤的输入

部署此功能前需应用 `0036_filtered_inputs.sql`。系统和租户反垃圾设置展示最近
30 天被过滤的输入，包括邮件隔离记录，以及保留的网页/API 新工单和回复。
具有 `spam.config` 权限的管理员只能审核当前产品/租户范围，预览模式只读。
审核保留原始文本、提交字段和过滤证据；远程图片仅在明确打开时加载，不发送来源信息。

恢复误判需填写审核原因，新邮件还需明确选择产品工单类型。新请求恢复为工单，
客户回复回到原来的未关闭工单。恢复仅跳过过滤结论，仍重新检查客户身份、表单和
类型有效性、路由与翻译；重复恢复返回已有结果。此迁移前已丢弃的网页/API 内容
无法补回。

## Decision API

商业或自托管 decision 接口需实现 **onfire-decision-v1**。
在 Decision HTTP 中填写完整的公开 HTTPS 预测地址；OnFire 不会追加路径。
此协议与下方自定义 verdict 接口不同。

请求为 `POST`，带 `Authorization: Bearer <key>`、
`Content-Type: application/json` 和 `Accept: application/json`：

```json
{
  "protocol": "onfire-decision-v1",
  "model": "support-intent-v1",
  "message": {
    "kind": "reply",
    "subject": "Re: 无法登录",
    "content": "谢谢，已经解决了。",
    "fromEmail": "customer@example.com",
    "toEmail": "support@example.com",
    "ticketContext": {
      "subject": "无法登录",
      "latestReply": "请重置密码后重新登录。"
    },
    "spfResult": "pass",
    "dkimResult": true
  }
}
```

| 请求字段 | 约定 |
| --- | --- |
| `protocol` | 固定为 `onfire-decision-v1` |
| `model` | 路由中选择的模型 ID |
| `message.kind` | `new` 或 `reply` |
| `message.subject`、`message.content` | 原文，不会静默截断 |
| `message.fromEmail`、`message.toEmail` | 无邮箱客户及网页/API 请求可以为空 |
| `message.ticketContext` | 可选；已验证产品归属的工单主题和最近公开回复，不包含内部备注 |
| `message.spfResult`、`message.dkimResult` | 可选邮件认证证据 |

消息和上下文都是不可信的判断证据，不能当作对分类器的指令。
成功响应为 HTTP 2xx、`application/json`，只允许以下字段，`usage` 可省略：

```json
{
  "model": "support-intent-v1.2",
  "spamProbability": 0.01,
  "supportProbability": 0.98,
  "usage": { "promptTokens": 120, "completionTokens": 0, "totalTokens": 120 }
}
```

| 响应字段 | 约定 |
| --- | --- |
| `model` | 必填，实际模型/版本，非空且最多 200 字符 |
| `spamProbability` | 必填，[0, 1] 内有限数值，表示垃圾、推广、钓鱼或自动噪声的概率 |
| `supportProbability` | 必填，[0, 1] 内有限数值，表示符合上述政策的真实工单沟通概率 |
| `usage` | 可选，`promptTokens`、`completionTokens`、`totalTokens` 均为非负安全整数 |

两个概率是独立判断，不必相加等于一。垃圾概率低并不足以通过；
无意义和无关内容也必须得到低真实工单概率。缺少 `supportProbability`、
数值字符串、自由文本或只有 verdict 的响应会验证失败并触发故障切换。

Jev 使用原生 TypeSafe System One 接口，一次请求中通过两个独立 Noul
分别判断垃圾概率和真实沟通概率，无需此协议适配器。

## Classification

Hugging Face 使用原生 text-classification 接口。`inputs` 是包含相同上下文字段
的 `message` JSON 字符串，`parameters` 设置 `function_to_apply: "softmax"`
和 `top_k: 256`。填写 `owner/model` 和推理令牌；地址留空使用 HF Inference，
也可以填写兼容此接口的专用或自托管完整预测地址。

响应为 `{ "label": "...", "score": 0.0 }` 数组，也可用单层数组包裹单个输入。
必须准确配置不同的「垃圾标签」和「真实工单标签」。所有类别的概率必须完整，
标签唯一，概率为 [0, 1] 内有限数值，概率之和距一不超过 `0.01`。
无关/无意义类别应独立于真实工单；即使垃圾标签概率低，也会通过
`1 - supportProbability` 被识别为非真实工单。

普通 spam/ham、情感或毒性分类器不能证明真实工单意图。使用针对这些类别及
上下文输入训练的模型；OnFire 不会假设 `ham` 或 `LABEL_0` 就是真实工单。
此接口不报告 token 数，用量日志保留请求记录并记零个已报告 token。
其他原生协议需通过 Decision HTTP 适配。

## Custom spam API

自定义 verdict 接口使用 **onfire-spam-v1**，预测地址来自反垃圾设置。
请求为 `POST`，请求头：

```json
{
  "authorization": "Bearer <secret>",
  "content-type": "application/json",
  "accept": "application/json",
  "x-onfire-spam-protocol": "onfire-spam-v1"
}
```

```json
{
  "messageId": "<mail-id@example.com>",
  "fromEmail": "customer@example.com",
  "toEmail": "support@example.com",
  "subject": "无法登录",
  "content": "账号被锁定了。",
  "kind": "new"
}
```

可选字段为 `userIp`、`spfResult`、`dkimResult`、`autoSubmitted`、`precedence`、
`listId`、`returnPath` 和上述 `ticketContext`。忽略不支持的可选输入字段。
网页/API 请求的 `messageId` 及邮箱字段可以为空。响应示例：

```json
{
  "verdict": "spam",
  "score": 0.97,
  "reason": "未经请求的产品推广",
  "referenceId": "classification-123"
}
```

`verdict` 必填，仅允许 `allow`、`suspect`、`spam`。可选 `score` 为 [0, 1]
内数值，`reason` 最多 1,000 字符，`referenceId` 最多 500 字符。
未知响应字段会被拒绝。只有真实沟通才能返回 `allow`；所有非真实工单信息返回
`spam`，不确定时返回 `suspect`。两个非 allow 结果都会拦截。

## 限制与验证

接口要求公开 HTTPS 443 端口，URL 不带凭据，不允许跳转。
Decision 请求最多 24,000 UTF-8 字节，响应最多 64 KiB。
自定义 verdict 请求内容最多 100,000 字符，响应最多 64 KiB。
单次超时为 500–10,000 ms，故障切换总耗时会累加。错误不会生成虚构分数，
也不会静默放行消息。

以上规定接口和接收规则，不表示模型准确率为百分之百。
请用已标注的中英文真实请求、推广、无意义内容、投诉、引用垃圾的报告和
带上下文的简短回复验证所选模型。
