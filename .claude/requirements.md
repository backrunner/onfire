# OnFire 需求文档

## 项目概述

OnFire 是一个从简设计的现代工单系统，旨在让用户可以快速创建工单，并提供给开发团队一个便利的访问、查看的 Dashboard，以及具有完善权限管理的工单管理和回复能力。

## 技术栈

- **运行时**: Node.js 22+ + Cloudflare Workers
- **框架**: Next.js 16 (App Router) + OpenNext/Cloudflare
- **数据库**: Cloudflare D1 (SQLite) + Drizzle ORM
- **认证**: Better Auth (ToB) / JWT + API Key (ToC)
- **前端**: React 19 + TypeScript
- **UI 组件**: shadcn/ui (zinc 主题)
- **样式**: Tailwind CSS 4
- **AI**: Vercel AI SDK v6 (支持 OpenAI/Anthropic/Google/xAI/DeepSeek)

---

## 架构设计

### ToB (To Business) - 内部管理系统

后台管理系统，供内部客服团队使用：
- 工单处理和管理
- 客户信息查看
- 团队和人员管理
- 产品和模板配置
- Dashboard 统计

### ToC (To Customer) - 客户门户

工单提交和查询系统，供终端用户使用：
- 工单提交页面
- 工单列表和详情查看
- 工单回复功能

---

## RBAC 角色权限系统

### 角色层级

```
SuperAdmin
    └── TenantAdmin
            └── ProductAdmin
                    └── TeamAdmin
                            └── Agent
```

### 业务层级

```
Tenant
    ├── Product ←→ Team  [多对多]
    │       │
    │       └── Template (工单模板)
    │       └── ProductKey (API Key)
    │
    └── Team
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

---

## 工单生命周期

### 状态流转

```
New
  ↓ [接单]
Processing
  ↓ [回复]
Replied
  ↓ [客户回复] → Processing
  ↓ [超时/手动关闭]
Closed

任意状态 → [升级] → Escalated
```

### 状态说明

| 状态 | 说明 |
|------|------|
| new | 新提交的工单，等待接单 |
| processing | 坐席已接单，正在处理 |
| replied | 坐席已回复，等待客户反馈 |
| escalated | 工单已升级到更高级别坐席 |
| closed | 工单已关闭，不再接受回复 |

### 优先级

| 优先级 | 说明 |
|--------|------|
| high | 高优先级，优先处理 |
| medium | 中优先级，默认 |
| low | 低优先级 |

### SLA 管理

产品管理员可以为每个优先级配置不同的 SLA 时间：
- **接单 SLA** (slaAcceptMinutes): 工单创建后允许接单的时间
- **回复 SLA** (slaReplyMinutes): 接单后允许首次回复的时间

超时工单在系统中标记为违规，并在 Dashboard 显示警告。

---

## 工单分配机制

### 自动分配规则

1. 用户提交工单时指定产品和类目
2. 系统根据 CategoryRoute 找到处理团队
3. 如果没有匹配的路由，使用租户的默认团队
4. 使用负载均衡算法在团队内选择坐席

### 负载均衡算法

```
排序规则：
1. 当前待处理工单数（升序）
2. 坐席等级（降序）
```

### 工单升级

低级别坐席可以升级无法处理的工单：
- 升级会在当前团队内找到更高级别的坐席
- 基于负载均衡算法自动分配
- 升级后工单状态变为 escalated

### 重新分配

团队管理员可以控制坐席是否可以重新分配工单：
- 如果允许，坐席可以在当前团队范围内重新分配给其他人
- 重新分配会重置 SLA 计时器

---

## AI 集成

基于 Vercel AI SDK v6，支持多个 AI 服务商：

### 支持的服务商

- OpenAI (GPT-4, GPT-4o, GPT-4o-mini)
- Anthropic (Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku)
- Google (Gemini 2.0 Flash, Gemini 1.5 Pro)
- xAI (Grok-2, Grok-2-mini)
- DeepSeek (DeepSeek-V3, DeepSeek-R1)

### AI 功能

1. **AI Agent 处理工单** - 自动处理简单工单
2. **AI 预审工单** - 自动分类和标签
3. **AI 预回复** - 生成回复建议

### 产品知识库

- 上传产品相关客服文档
- 输入产品功能描述
- 配置常见问题回复参考
- 规避 AI 幻觉

---

## 邮件系统

### 入站邮件流程

```
邮件到达 → Webhook 接收 → 安全检查 (SPF/DKIM)
    ↓
垃圾检查 → 是垃圾 → 记录，不创建工单
    ↓
回复检测 → 是回复 → 添加到现有工单
    ↓ 新邮件
AI 分类 → 支持请求 → 创建工单
        → 非支持 → 记录，不创建工单
```

### 出站邮件服务商

| 服务商 | 类型 | 说明 |
|--------|------|------|
| Resend | API | 现代邮件 API |
| SendGrid | API | 企业邮件服务 |
| Mailgun | API | 开发者友好 |
| Maileroo | API | 简单易用 |
| SMTP | 协议 | 通用 SMTP 服务器 |

---

## 高级搜索功能

提供独立的高级搜索页面：
- 搜索工单（主要功能）
- 多字段筛选（优先级、状态、时间等）
- 输入框自动补全
- 搜索结果展示

---

## UI/UX 设计规范

### 主题

- **颜色系统**: zinc (中性灰色调)
- **支持模式**: 浅色模式 + 深色模式

### 颜色规范

**浅色模式**:
- 背景: white / zinc-50
- 主要操作: zinc-900
- 成功状态: emerald-500/600
- 警告状态: amber-500/600
- 危险操作: red-500/600
- 信息提示: sky-500/600
- 次要文本: zinc-400/500

**深色模式**:
- 背景: zinc-950 / zinc-900
- 主要操作: zinc-50
- 成功状态: emerald-400
- 警告状态: amber-400
- 危险操作: red-400
- 信息提示: sky-400
- 次要文本: zinc-500/600

### 布局规范

**ToB 管理后台**:
- 可折叠左侧导航栏
- 固定顶部标题栏
- 工单列表分屏视图（列表 + 详情）
- 响应式设计

**ToC 客户门户**:
- 简洁的单页应用
- 顶部产品和用户信息展示
- 表单驱动的工单提交
- 卡片式工单列表

---

## 技术要求

1. **安全性**
   - 所有凭证通过环境变量设置
   - 严格的 API 权限检查
   - Turnstile 验证码保护公开端点

2. **代码规范**
   - TypeScript 严格模式
   - 良好的目录结构，多级子目录
   - 共享类型定义

3. **部署**
   - 前后端打包上传到 Cloudflare Worker
   - 通过 Wrangler 管理部署
   - D1 数据库迁移通过 Drizzle 管理
