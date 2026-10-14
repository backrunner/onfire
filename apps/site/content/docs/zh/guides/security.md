---
title: 账户安全
description: 用 Passkey、TOTP 和有界尝试限制保护工作台登录。
order: 10
---

## 认证与个人设置

ToB 使用 Better Auth 浏览器会话。账户安全通过一个设置弹窗管理密码、Passkey 和
认证器 TOTP。Passkey 绑定 `BETTER_AUTH_URL` 的准确主机名与 origin，应与部署的
管理域名一致。用户只能管理自己的 Passkey。

启用 TOTP 需要当前密码并验证第一个验证码。已启用账户的密码登录必须完成二次验证。
恢复码仅在生成时展示；修改/禁用 TOTP 或重建恢复码需当前密码。可信设备状态保持
30 天，更换设备前保留恢复方式。

## 登录保护

D1 限制在认证前执行：每 IP 每分钟 30 次、每 15 分钟 100 次；每个规范化邮箱
15 分钟内最多 10 次密码尝试，包括成功尝试。未知邮箱采用相同策略。账户计数器
使用 HMAC key，不存原始邮箱。TOTP/恢复码共用 Better Auth 每账户 15 分钟内
10 次失败的锁定。

限流服务失败会拒绝认证，HTTP 429 包含 `Retry-After`，请求体受限且响应不可缓存。
维护 cron 清理过期计数器。这些保护与 Cloudflare Access 配合使用。

## 其他凭据

[账户 API Key](/docs/zh/guides/account-api-keys)用于明确授权 REST 操作，
[MCP OAuth](/docs/zh/guides/automation)有独立委托。浏览器退出不会撤销它们，
需要分别撤销 Key 与已连接应用。预览、账户 bearer Key 和 MCP token 不能管理
个人安全或创建账户 Key。[产品 Key](/docs/zh/guides/customer-portal)仅用于 ToC。
