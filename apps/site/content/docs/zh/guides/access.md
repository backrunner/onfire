---
title: 权限与角色
description: 在每个 API 边界同时校验权限和资源范围。
order: 4
---

角色层级为 `SuperAdmin → TenantAdmin → ProductAdmin → TeamAdmin → Agent`。角色权限决定可以做什么；租户、产品和团队成员关系决定可以在哪些资源上操作。

产品生命周期权限与产品设置权限分开。产品管理员可以配置自己负责的产品，但不能创建或删除产品。支持客服成员关系也独立于用于登录的系统账号。

SuperAdmin 和 TenantAdmin 可以预览严格低一级的角色。预览只读，MCP 授权不会继承预览身份。所有 API 写入都会重新校验实时身份、权限和租户完整性。
