---
title: 邮件接收与投递
description: 配置产品邮件、会话关联、模板与可选邮件代理。
order: 11
---

## 产品设置

每个产品配置页保存入站/出站提供商、发件人、模板和日志。`/admin/email` 会跳转到
产品设置，不是独立一级邮件控制台。外发支持 Resend、SendGrid、Mailgun、Maileroo、
SMTP 和 Cloudflare Email。SMTP 使用已配置服务器，API 提供商使用密钥，Cloudflare
使用 `SEND_EMAIL` 绑定，不需要工作台 API Key。

## 入站与隔离

通用/提供商 webhook、Stalwart 和 Cloudflare 路由进入相同处理链。空白纯文本会
回退到清洗后的 HTML 文本。在外部模型前执行产品/消息去重、空内容/上游垃圾、严格
SPF/DKIM、自动/邮件列表/退信检查和发件人限流。已配置的[反垃圾过滤](/docs/zh/guides/spam-filter)
覆盖新邮件与匹配回复，拒绝和验证失败进入人工审核。

可选邮件 AI 预筛是独立功能，用于新邮件的支持意图、产品类型选择和分析，需要有效
`prescreening` 路由。类型结果无效或低置信度时使用隐藏 `unclassified` 回退，但
不能让不符合表单约束的提交变成有效。

主题支持数字及旧 UUID 工单标记，同时验证产品和当前客户邮箱。有效的
`In-Reply-To`/`References` 优先。外发公开回复在各提供商中保留这些头；Maileroo
使用结构化 v2 发送并保存提供商引用。非图片邮件附件与 `cid:` 图片会被过滤，不应
把邮件附件作为文档上传通道。

放行隔离的新会话需明确选择类型，匹配回复保留原类型。放行记录操作者和原因，不会
重新运行已拒绝过滤器并静默丢弃人工决定。

## 通用入站 webhook

ToC 域名的 `POST /api/toc/webhooks/inbound` 按已配置产品
入站地址和秘密认证。使用 `Authorization: Bearer <secret>`，或对准确原始请求体
计算 HMAC-SHA256，放入 `X-Webhook-Signature: sha256=<hex>`。

```json
{
  "from_email": "customer@example.com",
  "to_email": "support@example.com",
  "subject": "无法登录",
  "body_plain": "账号被锁定了。",
  "message_id": "<message-id@example.com>"
}
```

`from_email`、`to_email`、`subject` 必填，`body_plain`/`body_html` 至少一个。
可选 `from_name`、`spf_result`、`dkim_result`、`is_spam`。在产品邮件设置生成/更换
秘密，或使用 `POST /api/tob/admin/email-config/:productId/webhook-secret`。
Cloudflare 路由邮件使用 Worker handler，不需要 webhook 秘密。

## 模板

类型为 `ticket_created`、`ticket_replied`、`ticket_closed`、`ticket_escalated`。
变量包括数字编号 `ticket_id`、`subject`、`customer_name`、`customer_email`、
`agent_name`、`reply_content`、`product_name`，写法如 `{{ticket_id}}`。
未覆盖时使用系统默认。预览和投递共用渲染器，客户标量文本转义，`reply_content`
使用已清洗 HTML。沙箱预览不能执行脚本或外部请求。HTML 编辑器支持格式化/压缩
及光标位置插入变量。

## Cloudflare 邮件代理

原始 MIME/信封保存在私有 R2，队列只传引用。应用 Worker 消费入站任务并拥有 D1/cron。
可选传输 Worker 经受限 `MailAgentGateway` RPC 消费出站任务，不绑定 D1 或
`AUTH_SECRET`。只有与准确产品映射的允许发件人使用此路径。

客服公开回复与邮件渲染意图一起提交；持久化 outbox 和每五分钟修复扫描恢复中断的
渲染/入队。发送使用原子 claim 和 R2 收据。`sent` 表示提供商接受，不是已到收件箱。
模糊结果进入 `uncertain`，阻止该工单后续投递，需先核对，目前没有工作台重发按钮。

应用所有迁移，先部署主 Worker，再部署代理。两端地址允许列表、产品映射和发件绑定
必须一致。队列/DLQ 与收据处理见[部署](/docs/zh/start/deployment)及[恢复](/docs/zh/guides/operations)。
