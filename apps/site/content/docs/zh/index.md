---
title: OnFire 使用手册
description: 部署、配置并接入当前实现的 OnFire 工单系统。
order: 0
---

OnFire 的客户门户（ToC）与内部工作台（ToB）共用一个 Cloudflare Worker。
可选邮件代理是独立的传输 Worker。D1 保存业务记录，R2 保存图片、源文档和原始邮件，
Vectorize 为结构化产品知识建立向量索引。

## 安装与运维

- [快速开始](/docs/zh/start/quickstart)：本地 D1、演示账号和两个网页入口。
- [部署](/docs/zh/start/deployment)：资源、域名、密钥与 Worker 部署顺序。
- [运维](/docs/zh/guides/operations)：发布检查、日志、备份和恢复。

## 配置工作空间

- [权限与角色](/docs/zh/guides/access)：实时范围、团队与客服成员身份。
- [账户安全](/docs/zh/guides/security)：密码、Passkey、TOTP 和登录保护。
- [类型与表单](/docs/zh/guides/forms)：路由树、不可变版本和内部状态。
- [工单流程](/docs/zh/guides/tickets)：编号、分配、SLA、回复和关闭。
- [语言](/docs/zh/guides/languages)：产品语言与持久化翻译。
- [邮件](/docs/zh/guides/email)：入站适配、会话关联、模板和持久化传输。
- [通知](/docs/zh/guides/notifications)：个人接收端点和继承规则。
- [AI 与知识库](/docs/zh/guides/ai)：范围凭据、任务路由和知识重建。
- [反垃圾接口规范](/docs/zh/guides/spam-filter)：真实沟通政策与模型/API 协议。

## 集成

- [客户门户](/docs/zh/guides/customer-portal)：产品 Key、身份解析与 `/support` 代理。
- [账户 API Key](/docs/zh/guides/account-api-keys)：明确授权的 REST 操作和实时发现。
- [MCP 与 WebMCP](/docs/zh/guides/automation)：远程 OAuth 委托与已登录浏览器工具。

这些页面描述当前源码，包括尚待发布的 decision 过滤改动。现有实例需应用匹配迁移并
部署对应 Worker，才能使用新增行为。AI 功能需要有效凭据；上传源文档不代表已自动
提取内容或建立索引。
