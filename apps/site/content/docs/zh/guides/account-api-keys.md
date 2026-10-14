---
title: 账户 API Key
description: 授权准确 REST 操作，并发现当前有效接口协议。
order: 13
---

## 创建与范围

使用所有者真实浏览器会话，在账户 → 账户 API Key 创建 `ofk_` Bearer Key。选择
明确操作，以及全部当前可访问资源或指定产品。创建时必须设未来到期，最多 365 天。
明文仅展示一次，数据库只存哈希。编辑可缩短到期或替换授权，不能续期原 Key。
轮换需创建新 Key、更新使用方，再不可逆撤销旧 Key。

有效权限为操作授权、所有者实时 RBAC、资源范围与选择产品的交集。新/未知接口默认
拒绝。指定产品模式用于产品/工单动作和范围查询；系统、租户、共用人员、AI 管理及
个人配置需账户资源模式，但仍受所有者角色限制。

## 调用前发现协议

向准确 ToB origin 发送 `Authorization: Bearer <account-key>`。显式 Authorization
不会回退到 cookie，产品 Key、客户 JWT 和 MCP token 不是账户 REST 凭据。

```sh
curl --fail-with-body   -H "Authorization: Bearer $ONFIRE_API_KEY"   "$ONFIRE_BASE_URL/api/tob/api-key"
```

发现返回安全 Key/所有者元数据及有效操作的 `id`、`method`、`path`、`description`、
`productScoped`、`inputSchema`。路径 ID 为顶层参数，查询和提交使用 `query`/`body`。
Multipart 还声明文件字段与内容类型，优先使用实时协议而非复制的接口列表。

公开回复与内部备注授权分开，分配与转派也分开。状态重新打开还需 reopen 授权，
批量分配已分配工单需转派授权。API 路径使用 UUID，显示/搜索使用数字工单编号。
过时状态的写入返回 409，不产生回复、历史或邮件副作用，重试前重新读取状态。

## 管理与边界

仅所有者浏览器会话可列出/创建/修改/撤销 Key；预览和 bearer 不能管理。浏览器写入
要求准确 ToB Origin。退出登录不撤销 Key，实时角色/成员身份丢失缩小后续请求权限；
撤销不能取消已授权并正在执行的操作。

限流为每 IP 每分钟 300 次、每 Key 每分钟 120 次，每账户每小时创建 20 个 Key。
限流失败拒绝访问，429 包含 `Retry-After`，凭据响应不可缓存。本地客户端可不带
Origin，但存在时须匹配 ToB。Cloudflare Access 可能还要求机器 service token。

安全注册、预览、OAuth 管理、账户 Key 管理及流式助手不在此 REST 操作列表。
可移植的 [OnFire API skill](https://github.com/backrunner/onfire/tree/main/.agents/skills/onfire-api)
使用实时发现和范围 Key，与 [OAuth MCP](/docs/zh/guides/automation)及
[ToC 产品 Key](/docs/zh/guides/customer-portal)不同。
