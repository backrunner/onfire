## OnFire 项目需求总览

### 核心愿景
- 构建现代化、从简设计的工单系统「OnFire」，支持快速提交流程、丰富 Dashboard、完善 RBAC、可扩展模板与客服分配策略。
- 采用 monorepo + Turborepo，前后端分离但共用数据库；部署为两个 Cloudflare Worker（ToC、ToB），各自独立前后端。

### 技术栈与基础要求
- 后端：Bun + TypeScript，ElysiaJS（Cloudflare Worker adapter），Cloudflare D1 / Worker 平台，接入 Better Auth 管理登录。
- 前端：React + TypeScript + shadcn/ui（zinc 主题，现代紧凑 UI）。
- SDK：TypeScript、类型安全，封装 Product 侧 API（查询工单、模板、提交工单等）。
- 所有凭据通过环境变量（如 SMTP 等），严禁写入代码。
- 单 Worker 打包前端静态资源 + Elysia 服务（无状态）。
- 目录多级分层，清晰区分 apps（ToC/ToB）、workers（ToC/ToB）、packages（shared/ui/sdk）。

### 业务模型与 RBAC
- 分层：Tenant → Product；Product 可绑定多个 Team（多对多），Team 可覆盖多个 Product；可细化到 Product 的问题类目分配。
- 角色：超级管理员（全局）、Tenant 管理员（管辖本 Tenant）、Product 管理员、Team 管理员、客服（最低权限）。管理员也可成为客服坐席。
- 客服坐席 Profile 与系统账号 Profile 分离，默认同步，可由 Team 及以上管理员修改。
- 权限大纲：超级管理员全量管理；Tenant 管理员管理本租户的团队、人员、产品；Team 管理员管理本团队；客服仅处理分配工单。重分配权限由 Team 及以上控制。

### 工单与流程
- 状态：New / Processing / Replied / Closed，另有升级状态。
- 提交流转：用户针对某 Product 的类目提交 → 根据 Product/类目匹配 Team（否则用 Tenant 默认 Team）→ 在 Team 内均衡分配坐席。
- 坐席等级：Team 管理员及以上可分配等级；等级定义由 Product 管理员及以上配置。升级时在更高等级坐席中基于载荷自动分配。
- 时效：Product 管理员及以上配置。两类 SLA：接单超时、响应超时（重分配/升级重置计时）。按优先级（高/中/低）配置。
- 优先级：客服坐席可调整，需填写理由。高优先级待处理工单列表靠前。
- 关闭：已回复若长时间无用户反馈自动关闭；客服可在办结后主动关闭；关闭后用户不可再回复。
- 历史：记录所有操作历史，详情页可查看。

### Dashboard 与列表
- 管理员视角：Super/Tenant/Product/Team 管理员分别看到对应范围的工单积压、统计、分类数据。Team/Product 管理员可见待处理工单列表；Tenant/Super 以统计为主。
- 客服视角：个人待处理工单列表 + 个人载荷。
- 全局列表页：筛选（类别、状态、时效）、排序（优先级、过期等）。

### 客户与提交
- API 提交需携带用户 Email、业务方 ID、等级标识、可扩展元数据。
- 客户系统：同一 Tenant 基于 Email 聚合，支持按用户维度查看跨产品问题。Tenant 管理员查看全租户用户；Product 管理员查看关联用户。
- 工单模板：为 Product 预设多级分类 + Form Schema；提交时存为可扩展 JSON；详情页解析展示。
- 验证码：工单提交与回复接入 Turnstile。

### ToC
- 提供无状态前端页面：工单提交、列表与详情（含继续回复，未关闭时）。
- 通过 JWT 仅换取 Product + 用户身份，基于身份初始化模板/列表等。
- SDK：封装查询工单、拉取模板、提交工单；可生成跳转 URL，OnFire 生成临时 JWT 让用户带身份进入 ToC 页面。

### ToB
- 前端采用经典后台布局：左侧功能侧边栏，右侧业务内容。
- 后端 Worker 提供客服、管理员操作，统一 RBAC 校验。

### 安全与设计要求
- 强化权限校验，避免越权；所有敏感配置用环境变量。
- UI 现代、紧凑、美观，优先使用 shadcn/ui + zinc 主题。

