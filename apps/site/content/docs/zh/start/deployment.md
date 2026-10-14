---
title: 部署到 Cloudflare
description: 配置资源、构建/运行域名并按顺序发布 Worker。
order: 2
---

应用 Worker 共用 ToB/ToC，拥有 D1、cron 与入站处理；可选邮件代理负责允许发件人的
Cloudflare 传输。文档为独立静态 Pages。两个网页域名不等于两个应用 Worker。

## 资源与绑定

在自己的账户参考当前 `wrangler.jsonc` 和 `workers/email-agent/wrangler.jsonc`，
替换示例域名、零 D1 ID 和占位产品映射。示例 Vectorize 为 1024 维 cosine，启用
知识前先选择匹配模型/索引。

| 资源 / 绑定 | 职责 |
| --- | --- |
| D1 `DB` | 应用业务数据和全部迁移 |
| R2 `R2` | 内联图片、原始知识文档 |
| Vectorize `VECTORIZE` | 产品/模型独立知识空间 |
| R2 `EMAIL_STORAGE` | 两端共用私有原始 MIME 与收据 |
| 入站 Queue / DLQ | 主 Worker 消费，入口生产 |
| 出站 Queue / DLQ | 主 Worker 生产，可选代理消费 |
| `SEND_EMAIL` | Cloudflare Email Sending |
| `WORKER_SELF_REFERENCE` | 应用后台工作 |
| 代理 `MAIN_MAIL` | 受限主 Worker `MailAgentGateway` RPC |

即使最初只用网页工单，主模板仍含队列/桶绑定。每个队列一个消费者和 DLQ。配置邮件
R2 生命周期为 30 天，队列/DLQ 保留为 14 天。代理不绑定 D1 或 `AUTH_SECRET`。

## 域名与秘密

绑定不同的管理/客户 Custom Domain。设置准确 HTTPS `BETTER_AUTH_URL`，逗号
分隔的 `ADMIN_DOMAINS`/`TOC_DOMAINS`，以及从 `.env.production.example` 复制的
匹配 `.env.production.local`。构建时 middleware 值与 Wrangler 运行值一致，移除
冲突 `.env.local`。生产禁用 `workers_dev`、开发端口路由和调试。

通过 Wrangler 保存随机 `AUTH_SECRET`。它还加密保存凭据，现有数据库需保留恢复
副本并规划轮换。构建 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 与运行 `TURNSTILE_SECRET`
成对配置：都无则有意禁用 CAPTCHA，仅存在服务器秘密时受保护客户操作失败关闭。

## 验证、迁移与发布

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm cf-typegen
pnpm cf-typegen --check
pnpm lint
pnpm test
pnpm build:worker
pnpm exec drizzle-kit check
pnpm exec wrangler deploy --dry-run
```

备份现有 D1，确认目标账户/数据库，应用**全部**迁移，再部署已构建主 Worker：

```sh
pnpm db:migrate:remote
pnpm exec wrangler deploy
```

不能停留在历史 `0028` 或 `0033`：当前检出还包括 `0034`、`0035` decision 过滤迁移。
在开放 `/admin/install` 前用 Access 保护管理域名，创建首个管理员，再配置产品、
团队、客服、类型和表单。门户需先接入[客户身份](/docs/zh/guides/customer-portal)。
`pnpm deploy` 重建并部署主 Worker，不部署代理。

## 可选邮件代理顺序

先发布具有 RPC export 且已迁移 schema 的主 Worker。配置产品 Cloudflare 入站/
出站地址、两端 `EMAIL_AGENT_ADDRESSES`、代理 `SEND_EMAIL.allowed_sender_addresses`
和主 Worker `EMAIL_AGENT_PRODUCTS` 中真实产品 ID。绑定/变量改变后重建发布主
Worker，再执行 `pnpm deploy:email-agent`。每个接收地址只路由到一个入站 Worker。
发件域 Sending/Routing 验证与 DNS 是独立运维操作，支持子域 Cloudflare MX 与
其他邮件服务的根域 MX 共存。

## 静态文档站

`apps/site` 为独立工作空间，使用 svedocs 0.3.0 和 SvelteKit 3，准确 origin 为
`https://onfire.pwp.sh`。Pages 项目根为 `apps/site`，构建命令为
`pnpm install --frozen-lockfile && pnpm build`，输出 `build`，变量
`SITE_URL=https://onfire.pwp.sh`。英语位于 `/` 和 `/docs/`，中文位于 `/zh/`
和 `/docs/zh/...`。本地搜索、Markdown twins、llms.txt 和 sitemap 为静态输出，
文档站 Ask AI 禁用。发布 Pages 不会发布应用 Worker。

现有实例使用忽略的私有部署配置，保持公开示例与秘密分离。开放实例前检查
[运维](/docs/zh/guides/operations)和 [MCP Access 豁免](/docs/zh/guides/automation)。
