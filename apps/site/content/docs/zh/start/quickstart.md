---
title: 快速开始
description: 使用本地 D1 数据启动 OnFire 工作空间。
order: 1
---

## 环境要求

- Node.js 22 或更高版本
- pnpm 12.3.4
- Wrangler 本地 Cloudflare 环境

## 安装和填充演示数据

```sh
git clone https://github.com/backrunner/onfire.git
cd onfire
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
cp .env.example .env.local
openssl rand -base64 48
```

将生成的值写入 `.dev.vars` 的 `AUTH_SECRET`，然后初始化本地 D1：

```sh
pnpm db:migrate:local
pnpm db:seed
pnpm db:seed:tickets
```

先启动管理端，再在第二个终端启动客户端：

```sh
pnpm dev:tob       # http://localhost:3001
pnpm dev:toc       # http://localhost:3000
```

演示管理端账号为 `admin@local.onfire` / `admin`。`pnpm db:reset` 会先删除本地 D1 数据再重新创建演示环境，生产环境不要使用演示账号。

## 验证环境

```sh
pnpm cf-typegen --check
pnpm lint
pnpm test
pnpm build:worker
```

Vectorize、外部 AI、Cloudflare Email 和通知服务需要部署后或单独配置。
