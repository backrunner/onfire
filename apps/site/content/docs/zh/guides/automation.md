---
title: MCP 与 WebMCP
description: 选择远程 OAuth 委托或已登录工作台浏览器工具。
order: 14
---

## 选择入口

| 集成 | 身份 | 可操作范围 |
| --- | --- | --- |
| [账户 REST Key](/docs/zh/guides/account-api-keys) | 明确的 `ofk_` 操作授权 | 广泛的范围管理 API 与实时输入协议发现 |
| 远程 MCP | 准确 ToB `/mcp` 的 OAuth 授权 | 委托的工单动作和产品设置 |
| 工作台 WebMCP | 当前 Better Auth 浏览器会话 | 按权限过滤的结构化工作台操作 |

产品/客户凭据属于 ToC，不能管理 ToB。三种管理集成不继承彼此授权。

## 远程 MCP 配置

使用准确资源 `https://admin.example.com/mcp`，客户端需支持 Streamable HTTP、
OAuth 2.1 授权码与 PKCE S256。配置该 URL，再通过发现、登录和同意页授权。
公共客户端不需要复制产品 Key 或 OAuth client secret。

| 用途 | 准确 ToB origin 下的路径 |
| --- | --- |
| 受保护资源元数据 | `/.well-known/oauth-protected-resource/mcp` |
| 授权服务器元数据 | `/.well-known/oauth-authorization-server/api/tob/auth` |
| 授权 | `/api/tob/auth/oauth2/authorize` |
| 动态注册 | `/api/tob/auth/oauth2/register` |
| Token / 刷新 | `/api/tob/auth/oauth2/token` |
| 撤销 | `/api/tob/auth/oauth2/revoke` |

`onfire:mcp` 是协议 scope，不是业务权限。可选 `offline_access` 请求刷新 token。
同意页单独选择原子权限和全部可访问资源，或租户/产品并集。选择租户只覆盖其中可访问
产品及后续获得的产品；选择产品只覆盖该产品。有效权限与实时 RBAC/资源范围取交集。

能力为 `tickets:read`、`tickets:reply`、`tickets:update_status`、
`tickets:update_priority`、`tickets:assign`、`tickets:reassign`、
`tickets:escalate`、`tickets:close`、`settings:read`、`settings:write`。
仅注册有效工具，执行再次验证。Settings 只暴露范围产品配置，不暴露密钥或全面系统
管理。工单写入沿用正常 SLA、翻译、分配、历史和通知；关闭支持 `notifyCustomer`，
默认通知客户。

回调要求 HTTPS 或准确 HTTP loopback 主机 `localhost`、`127.0.0.1`、`[::1]`。
只有原生 loopback 回调可以改变注册端口。注册使用 JSON，token/revoke 使用 form。
OAuth `resource` 必须准确等于 MCP URL，不能多尾斜杠或换主机。原生请求可省略
Origin，存在时须准确匹配 ToB。发现/OAuth/MCP 响应不可缓存。支持 DCR，CIMD
保持禁用。

重新授权替换 grant 并作废旧 access/refresh 家族，账户页撤销还会移除同意记录。
交互授权始终重新打开细粒度同意页；浏览器退出不撤销委托，但每次请求仍检查实时成员身份。

## Cloudflare Access

保留交互管理页面保护。标准客户端需要只针对 `/mcp`、两个资源元数据路径、授权
服务器元数据和 OAuth register/token/revoke 的小范围豁免，不豁免整个 `/api/tob/*`
或交互 authorize。机器 REST Key 可改用 Access service-token 策略。准确运维路径
见[仓库集成参考](https://github.com/backrunner/onfire/blob/main/.agents/MCP_INTEGRATION.md)。

## 工作台 WebMCP

在兼容浏览器登录 ToB 并保持工作台页打开。OnFire 检测 `document.modelContext`
及旧 `navigator.modelContext`，不支持时保留正常 UI。工具发现按当前权限过滤，
执行先验证身份再调用常规范围 API，预览只暴露读操作。

工具涵盖工单、产品、类型/表单/版本、内部状态、人员/客户、邮件、通知及范围 AI/知识。
先调用 `onfire_get_context` 并发现当前 schema；ID 在顶层，筛选和负载使用
`query`/`body`，不提供任意 URL/方法代理。个人安全、预览控制、OAuth 授权、
一次性凭据流程、二进制上传和流式会话保留交互界面。

退出、过期、身份变化和离开页面使回调失效。写入会刷新工作台，但 UI 刷新失败不重试
已完成写入。浏览器支持/调用 API 可能不同，使用其当前 WebMCP 集成，不伪造 polyfill
或跨来源桥接。
