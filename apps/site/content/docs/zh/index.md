---
title: OnFire 使用手册
description: 学习安装、配置、接入和运维 OnFire 工作空间。
order: 0
---

OnFire 是一套现代工单系统，包含客户门户、内部客服工作台、邮件流程、AI 助手和按范围授权的自动化能力。

## 从这里开始

- [快速开始](/docs/zh/start/quickstart)：几分钟内启动本地演示环境。
- [部署](/docs/zh/start/deployment)：创建 Cloudflare 资源并部署两个 Worker。
- [工单流程](/docs/zh/guides/tickets)：了解表单、路由、分配和 SLA。
- [权限与角色](/docs/zh/guides/access)：配置租户、产品和团队范围。
- [AI 与知识库](/docs/zh/guides/ai)：连接服务商，不把凭据放进仓库。
- [自动化](/docs/zh/guides/automation)：通过 MCP 授权，或使用工作台 WebMCP 工具。

## OnFire 的组成

面向客户的门户是 **ToC**，内部管理工作台是 **ToB**。两个界面运行在同一个 OpenNext Worker 上；可选的邮件 Worker 为允许的地址处理基于队列的 Cloudflare Email Sending。

业务数据保存在 D1，行内图片和 MIME 邮件保存在 R2，知识向量保存在 Vectorize。每个 API 边界都会同时校验角色权限和实时资源范围。
