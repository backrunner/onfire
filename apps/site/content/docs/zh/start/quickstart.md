---
title: 快速开始
description: 运行本地演示，配置第一条客户工单接收流程。
order: 1
---

## 环境要求

使用 Node.js `^22.17.0`、`^24.0.0` 或 `>=26.0.0`，以及仓库指定的 pnpm
版本（当前为 `12.3.4`）。Wrangler 在本地运行 D1，演示不需要生产数据库。
`apps/site` 是独立的 pnpm 工作空间。

## 安装与初始化

```sh
git clone https://github.com/backrunner/onfire.git
cd onfire
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
cp .env.example .env.local
openssl rand -base64 48
```

将生成的随机密钥填入 `.dev.vars` 的 `AUTH_SECRET`。两个环境文件的本地
`BETTER_AUTH_URL` 与路由域名保持一致，然后执行：

```sh
pnpm db:migrate:local
pnpm db:seed
pnpm db:seed:tickets
pnpm dev
```

`pnpm dev` 同时启动 `http://localhost:3000` 的 ToC 和
`http://localhost:3001` 的 ToB。也可以在两个终端分别运行 `pnpm dev:toc`
与 `pnpm dev:tob`。演示登录为 `admin@local.onfire` / `admin`。
`pnpm db:reset` 会删除本地 D1 状态、重新迁移并初始化，只在确实要重置演示时使用。

## 首次配置

1. 登录工作台，检查演示租户、产品和默认团队。
2. 创建或检查产品工单类型与正在使用的表单版本。
3. 把有效客服加入路由团队；账户角色本身不等于客服成员身份。
4. 通过产品 Key 或身份解析打开[客户门户](/docs/zh/guides/customer-portal)。
5. 按需单独配置邮件、AI 和个人通知端点。

门户需要已验证客户身份。产品 Key 保留在业务服务器，不放进浏览器。
外部提供商、Vectorize 和真实 Cloudflare 邮件需要单独配置的环境。

## 验证

```sh
pnpm cf-typegen --check
pnpm lint
pnpm test
pnpm build:worker
```

本地检查不等于生产邮件送达或远程 Access 策略验证。真实实例继续阅读[部署](/docs/zh/start/deployment)。
