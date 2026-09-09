---
title: 部署到 Cloudflare
description: 使用自己的资源部署应用 Worker 和邮件 Worker。
order: 2
---

OnFire 面向 Cloudflare Workers 设计。公开仓库中的域名和资源 ID 都是示例值，部署前必须替换。

## 创建资源

在自己的账号中创建 D1、R2、Queues 和 1024 维 cosine Vectorize 索引。应用 Worker 独占 D1 和 cron；可选邮件 Worker 只通过受限命名 RPC 服务绑定访问主 Worker。

## 配置应用域名和密钥

配置一个管理端 Custom Domain 和一个客户端 Custom Domain。`BETTER_AUTH_URL`、`ADMIN_DOMAINS`、`TOC_DOMAINS` 以及生产环境的 Next.js 变量必须一致。使用 Wrangler 保存 `AUTH_SECRET` 和成对的 Turnstile 密钥，永远不要提交到仓库。

## 发布文档站

Landing 和文档是 `apps/site` 下独立的静态 SvelteKit 站点，计划使用
`https://onfire.pwp.sh` 作为正式地址。

在 Cloudflare Pages 中配置：

- 项目根目录：`apps/site`
- 构建命令：`pnpm install --frozen-lockfile && pnpm build`
- 输出目录：`build`
- 生产环境变量：`SITE_URL=https://onfire.pwp.sh`

将 `onfire.pwp.sh` 绑定为 Pages 自定义域名。构建结果包含 `/`、`/zh`、
`/docs` 和 `/docs/zh/...`，`SITE_URL` 会让 canonical、sitemap 和多语言
alternate 链接都使用该域名。

## 构建和迁移

```sh
pnpm cf-typegen
pnpm cf-typegen --check
pnpm lint
pnpm test
pnpm build:worker
pnpm exec wrangler deploy --dry-run
pnpm db:migrate:remote
pnpm exec wrangler deploy
```

在 Cloudflare Access 保护下访问 `/admin/install` 创建第一个管理员，再配置产品、团队、工单类型、表单和邮件服务，然后开放客户门户。

队列、邮件路由、MCP Access 例外和回滚步骤请阅读完整的[部署指南](https://github.com/backrunner/onfire/blob/main/docs/DEPLOYMENT.md)。
