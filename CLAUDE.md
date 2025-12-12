# OnFire - Modern Ticket System

OnFire 是一个从简设计的现代工单系统，旨在让用户可以快速创建工单，并且提供给开发团队一个便利的访问、查看的 Dashboard，以及具有完善权限管理的工单管理和回复能力。

## 技术栈

- **运行时**: Bun + Cloudflare Workers
- **后端框架**: ElysiaJS with Cloudflare Worker adapter
- **数据库**: Cloudflare D1 (SQLite) + Drizzle ORM
- **认证**: Better Auth (ToB) / JWT + API Key (ToC)
- **前端**: React 18 + TypeScript + Vite
- **UI 组件库**: shadcn/ui (zinc 主题)
- **样式**: Tailwind CSS
- **Monorepo**: Turborepo

## 项目结构

```
onfire/
├── apps/
│   ├── tob-web/          # ToB 前端 - 内部管理后台
│   └── toc-web/          # ToC 前端 - 客户工单门户
├── workers/
│   ├── tob-worker/       # ToB 后端 - 内部服务 API
│   └── toc-worker/       # ToC 后端 - 公开服务 API
├── packages/
│   ├── shared/           # 共享类型定义、Schema、RBAC
│   ├── sdk/              # TypeScript SDK
│   └── ui/               # 共享 UI 组件库
└── drizzle/
    └── migrations/       # 数据库迁移文件
```

## 架构设计

OnFire 分为两个部分：

### ToB (To Business) - 内部管理系统

供内部客服团队使用的后台管理系统，包括：
- 工单处理和管理
- 客户信息查看
- 团队和人员管理
- 产品和模版配置
- Dashboard 数据统计

### ToC (To Customer) - 客户门户

供终端用户使用的工单提交和查询系统，包括：
- 工单提交页面
- 工单列表和详情查看
- 工单回复功能

两个系统作为独立的 Cloudflare Worker 部署，共享同一个 D1 数据库。

---

## RBAC 角色权限体系

### 角色层级

```
SuperAdmin (超级管理员)
    └── TenantAdmin (租户管理员)
            └── ProductAdmin (产品管理员)
                    └── TeamAdmin (团队管理员)
                            └── Agent (客服)
```

### 业务层级

```
Tenant (租户)
    ├── Product (产品) ←→ Team (团队)  [多对多]
    │       │
    │       └── Template (工单模版)
    │       └── ProductKey (API 密钥)
    │
    └── Team (团队)
            └── Agent (客服坐席)
```

### 权限列表

| 权限 | SuperAdmin | TenantAdmin | ProductAdmin | TeamAdmin | Agent |
|------|:----------:|:-----------:|:------------:|:---------:|:-----:|
| ticket.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| ticket.write | ✓ | ✓ | ✓ | ✓ | ✓ |
| ticket.assign | ✓ | ✓ | ✓ | ✓ | - |
| ticket.escalate | ✓ | ✓ | ✓ | ✓ | - |
| ticket.close | ✓ | ✓ | ✓ | ✓ | ✓ |
| ticket.reassign | ✓ | ✓ | ✓ | ✓ | - |
| template.read | ✓ | ✓ | ✓ | - | - |
| template.write | ✓ | ✓ | ✓ | - | - |
| team.manage | ✓ | ✓ | ✓ | - | - |
| product.manage | ✓ | ✓ | - | - | - |
| tenant.manage | ✓ | - | - | - | - |
| user.manage | ✓ | ✓ | - | - | - |
| role.manage | ✓ | ✓ | - | - | - |
| customer.read | ✓ | ✓ | ✓ | ✓ | - |
| customer.write | ✓ | ✓ | ✓ | - | - |
| category.map | ✓ | ✓ | ✓ | ✓ | - |
| agent.profile | ✓ | ✓ | ✓ | ✓ | ✓ |

### 重要概念

- **客服** (Agent): 系统中的最低权限用户角色
- **客服坐席**: 工单的分配对象，与系统用户账号分离
- 管理员可以同时成为客服坐席，是否可以回复工单与 RBAC 权限无关

---

## 工单生命周期

### 状态流转

```
New (新建)
  ↓ [接单]
Processing (处理中)
  ↓ [回复]
Replied (已回复)
  ↓ [用户继续回复] → Processing
  ↓ [超时无回复/主动关闭]
Closed (已关闭)

任意状态 → [升级] → Escalated (升级中)
```

### 状态说明

| 状态 | 说明 |
|------|------|
| new | 新提交的工单，等待接单 |
| processing | 客服已接单，正在处理 |
| replied | 客服已回复，等待用户反馈 |
| escalated | 工单已升级到更高级别的客服 |
| closed | 工单已关闭，不再接受回复 |

### 优先级

| 优先级 | 说明 |
|--------|------|
| high | 高优先级，优先处理 |
| medium | 中优先级，默认 |
| low | 低优先级 |

### SLA 时效管理

Product 管理员可以为每个优先级配置不同的 SLA 时效：

- **接单时效** (slaAcceptMinutes): 工单创建后多久需要接单
- **回复时效** (slaReplyMinutes): 接单后多久需要首次回复

超时的工单会在系统中标记为 breached，并在 Dashboard 中告警显示。

---

## 工单分配机制

### 自动分配规则

1. 用户提交工单时指定产品和类目
2. 系统根据 CategoryRoute 查找对应的处理团队
3. 如果没有匹配的路由，使用产品所属 Tenant 的默认团队
4. 在团队内根据负载均衡算法选择客服坐席分配

### 负载均衡算法

```
排序规则:
1. 当前待处理工单数量 (升序)
2. 客服坐席等级 (降序)
```

### 工单升级

低级别客服坐席遇到无法处理的工单可以升级：
- 升级会在当前团队中寻找更高等级的坐席
- 根据负载均衡算法自动分配
- 升级后工单状态变为 escalated

### 重新分配

Team 管理员可以控制是否允许客服重新分配工单：
- 如果允许，客服可以在当前团队范围内选择其他人重新分配
- 重新分配会重置 SLA 计时

---

## API 结构

### ToB API (`/api/tob`)

认证方式: Better Auth (Bearer Token)

```
# 系统
GET  /health              - 健康检查
GET  /me                  - 获取当前用户信息和权限

# 认证
POST /auth/email/sign-in  - 邮箱登录
POST /auth/email/sign-up  - 邮箱注册
POST /auth/change-password - 修改密码

# 初始化
GET  /install/status      - 检查是否需要初始化
POST /install/finalize    - 完成初始化设置

# Dashboard
GET  /dashboard/summary   - 获取仪表盘统计数据

# 工单管理
GET    /tickets           - 工单列表 (支持筛选)
GET    /tickets/:id       - 工单详情 (含时间线)
POST   /tickets/:id/status    - 更新状态
POST   /tickets/:id/assign    - 分配/重新分配
POST   /tickets/:id/priority  - 修改优先级
POST   /tickets/:id/close     - 关闭工单
POST   /tickets/:id/escalate  - 升级工单
POST   /tickets/:id/reply     - 回复工单
POST   /tickets/status/bulk   - 批量更新状态
POST   /tickets/assign/bulk   - 批量分配

# 管理 (Admin)
GET/POST/PATCH/DELETE /admin/tenants      - 租户管理
GET/POST/PATCH/DELETE /admin/products     - 产品管理
GET/POST/PATCH/DELETE /admin/teams        - 团队管理
GET/POST/PATCH/DELETE /admin/templates    - 模版管理
GET/PATCH             /admin/users        - 用户管理
GET/PATCH             /admin/agents       - 坐席管理
GET                   /admin/customers    - 客户查询
GET/POST/PATCH/DELETE /admin/category-routes - 类目路由
GET/POST              /admin/product-keys     - API 密钥管理
POST                  /admin/product-keys/:id/rotate - 轮转密钥

# 元数据
GET  /meta/teams          - 获取可访问的团队
GET  /meta/products       - 获取可访问的产品
```

### ToC API (`/api/toc`)

认证方式: JWT (Bearer Token) 或 API Key

```
# 系统
GET  /health              - 健康检查
GET  /whoami              - 验证当前身份

# Token
POST /tokens/issue        - 使用 API Key 签发 JWT

# 模版
GET  /templates           - 获取产品模版列表

# 工单
POST   /tickets           - 提交工单
GET    /tickets           - 获取用户工单列表
GET    /tickets/:id       - 获取工单详情
POST   /tickets/:id/reply     - 回复工单
POST   /tickets/:id/escalate  - 升级工单

# 后台任务
POST /tasks/sla-scan      - SLA 超时扫描
```

---

## SDK 使用

### 安装

```typescript
import { OnfireClient } from '@onfire/sdk';
```

### 初始化

```typescript
const client = new OnfireClient({
  baseUrl: 'https://your-toc-worker.workers.dev/api/toc',
  token: 'jwt-token',  // 可选，用于已登录用户
  tocBaseUrl: 'https://your-toc-web.pages.dev'  // ToC 前端 URL
});
```

### 主要方法

```typescript
// 获取模版列表
await client.listTemplates(productId);

// 创建工单
await client.createTicket({
  productId: 'prod-xxx',
  templateId: 'tpl-xxx',
  subject: '问题标题',
  content: '问题描述',
  priority: 'medium',
  metadata: { category: '技术支持' },
  customer: {
    email: 'user@example.com',
    externalId: 'user-123',
    level: 80
  },
  turnstileToken: 'cf-turnstile-token'
});

// 获取工单列表
await client.listTickets({ status: 'new', productId: 'prod-xxx' });

// 获取工单详情
await client.getTicket(ticketId);

// 回复工单
await client.reply(ticketId, { content: '回复内容', turnstileToken: 'token' });

// 签发 JWT (服务端使用)
await client.issueCustomerJwt({
  apiKey: 'key-id.secret',
  email: 'user@example.com',
  externalId: 'user-123',
  level: 80
});

// 生成 ToC 页面 URL
const url = client.buildTocUrl(productId, jwt, { tab: 'list' });

// 签发 JWT 并生成 URL (一步完成)
const url = await client.buildTocUrlWithSigning(productId, {
  apiKey: 'key-id.secret',
  email: 'user@example.com'
});
```

---

## 数据库 Schema

### 主要表

| 表名 | 说明 |
|------|------|
| tenants | 租户 |
| products | 产品 |
| teams | 团队 |
| product_teams | 产品-团队关联 (多对多) |
| users | 系统用户 |
| agents | 客服坐席 |
| agent_teams | 坐席-团队关联 (多对多) |
| templates | 工单模版 |
| product_keys | API 密钥 |
| tickets | 工单 |
| replies | 工单回复 |
| history | 操作历史 |
| customers | 客户信息 |
| category_routes | 类目路由规则 |
| agent_profiles | 坐席档案 (可与用户信息不同) |

---

## UI/UX 设计规范

### 主题

- **色彩体系**: zinc (中性灰色调)
- **支持模式**: 明亮模式 + 暗黑模式

### 颜色规范

**明亮模式**:
- 背景: white / zinc-50
- 主要操作: zinc-900
- 成功状态: emerald-500/600
- 警告状态: amber-500/600
- 危险操作: red-500/600
- 信息提示: sky-500/600
- 次要文字: zinc-400/500

**暗黑模式**:
- 背景: zinc-950 / zinc-900
- 主要操作: zinc-50
- 成功状态: emerald-400
- 警告状态: amber-400
- 危险操作: red-400
- 信息提示: sky-400
- 次要文字: zinc-500/600

### 组件库

使用 shadcn/ui 作为基础组件库，包括:
- Button, Input, Textarea, Select
- Card, Badge, Table
- Dialog, Sheet, Tabs
- DropdownMenu, Tooltip
- Avatar, Progress, Skeleton
- ScrollArea, Separator, Accordion

### 布局规范

**ToB 管理后台**:
- 左侧可折叠导航栏
- 顶部固定标题栏
- 工单列表采用分栏视图 (列表 + 详情)
- 响应式设计

**ToC 客户门户**:
- 简洁的单页应用
- 顶部产品和用户信息展示
- 表单驱动的工单提交
- 卡片式工单列表

---

## 技术要求

1. **安全性**
   - 所有凭据通过环境变量设置
   - 严格的接口权限检查，防止越权访问
   - Turnstile 人机验证保护公开接口

2. **代码规范**
   - TypeScript 严格模式
   - 良好的目录结构，多级子目录管理代码
   - 共享类型定义在 @onfire/shared

3. **部署**
   - 前后端打包为一体上传到 Cloudflare Worker
   - 使用 Wrangler 进行部署管理
   - D1 数据库迁移通过 Drizzle 管理

---

## 环境变量

### ToB Worker

```env
AUTH_SECRET=xxx          # Better Auth 密钥
D1_DATABASE=onfire-d1    # D1 数据库绑定名
```

### ToC Worker

```env
JWT_ISSUER=onfire-toc    # JWT 签发者
JWT_AUDIENCE=toc         # JWT 受众
JWT_PUBLIC_KEY=xxx       # 公钥 JWK (可选)
TURNSTILE_SECRET=xxx     # Cloudflare Turnstile 密钥
D1_DATABASE=onfire-d1    # D1 数据库绑定名
```

### 前端

```env
VITE_TURNSTILE_SITE_KEY=xxx  # Turnstile 站点密钥
```

---

## 开发命令

```bash
# 安装依赖
bun install

# 开发模式
turbo dev

# 构建
turbo build

# 类型检查
turbo lint

# 数据库迁移
npm run db:generate      # 生成迁移
npm run db:migrate:all   # 应用迁移

# 部署
cd workers/tob-worker && wrangler deploy
cd workers/toc-worker && wrangler deploy
```
