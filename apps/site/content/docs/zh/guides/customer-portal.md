---
title: 客户门户接入
description: 安全签发客户身份，保持同源代理而不增加 CORS。
order: 12
---

## 选择身份流程

产品 Key 签发客户 JWT，账户 Key 管理 ToB，两者不能互换。产品 Key 只保留在业务
服务器，用于认证 `POST /api/toc/tokens`：

```json
{
  "apiKey": "<product-key>",
  "externalId": "business-user-123",
  "email": "customer@example.com",
  "level": 80
}
```

`email`/`externalId` 至少一个，`level` 可选，范围 0–100。标准 `{ok,data}` 响应
含 `token`、`customerId`、`productId` 和 `expiresIn: 86400`。客户 API 使用客户
token，不使用产品 Key。产品范围内稳定 externalId 在已验证邮箱改变后保留历史，
身份冲突会被拒绝，支持仅 externalId 的客户。

新产品 Key 默认 90 天，最多 365 天。轮换保留到期时间，只能缩短、不能延长，撤销
不可逆。旧 null 到期 Key 保持兼容，直到明确限制或撤销。产品 Key 到期阻止新签发，
不撤销已签发的 24 小时客户 token。

业务服务器签发客户 JWT 后，产品 ID 放在查询参数，token 放在片段中打开门户：

```text
https://product.example.com/support?productId=prod-123#token=customer-jwt
```

浏览器消费并移除这些 URL 字段，将会话保存在 `sessionStorage`，站内跳转复用。
旧查询参数 token 仍兼容，但会进入初次 HTTP 请求；优先使用片段，绝不暴露产品
Key。不完整的启动链接会清除上一个产品会话。

## 浏览器 Identity Resolver v1

浏览器接入优先使用短期、不透明且绑定产品的 credential：

```text
https://product.example.com/support?productId=prod-123#credential=opaque-value
```

门户先移除 URL 片段，再由服务器交换。配置产品公开 HTTPS resolver 与加密 Bearer
秘密。OnFire 请求：

```http
POST /configured/userinfo
Authorization: Bearer <configured-secret>
Content-Type: application/json
X-OnFire-Identity-Protocol: onfire-userinfo-v1

{"credential":"opaque-value","productId":"prod-123"}
```

返回必填 `externalId`，可选 `email`、整数 `level` 和 `expiresAt`：

```json
{"externalId":"business-user-123","email":"customer@example.com","level":80}
```

失效、已消费或产品不匹配的 credential 返回 401/403。建议单次使用、60 秒内过期。
接口要求公开 HTTPS/DNS 443 端口，不跳转，最多五秒和 64 KiB JSON 响应。不要把
产品 Key、邮箱或可复用凭据放入浏览器 URL。

JWT 仅携带 `sub`、`productId`、`tenantId` 路由声明及标准 JWT 元数据；每次请求
从 D1 加载可变邮箱、externalId 和等级，客户 API 不能访问其他客户或产品的工单。

## 反向代理

代理 `/support` 及所有下级路径，**不剥离前缀**。保留方法、查询、请求体、状态、
响应头和流。支持客户页面、`/support/api/toc/*`、`/support/_next/*`、`sw.js`
和 `icon.svg`，此前缀下 ToB 路径被拒绝。不要缓存门户 HTML/客户 API，哈希静态
文件可使用上游缓存策略。保留安全头和 service-worker 范围。nginx 最小配置：

```nginx
location ^~ /support/ {
  proxy_pass https://support.example.com;
  proxy_set_header Host support.example.com;
  proxy_set_header X-Forwarded-Proto $scheme;
}
location = /support {
  proxy_pass https://support.example.com/support;
  proxy_set_header Host support.example.com;
}
```

浏览器请求保持同源，不支持无关来源的 CORS 直连。

## 会话与接收

token 有效 24 小时。401 后门户清除 token，仅暂时保留产品 ID 加载安全返回配置。
`portalReturnUrl` 优先于 `homepageUrl`，两者皆无则回到门户根路径，只允许 HTTP(S)
返回地址。

提交需要产品类型/表单 ID、表单验证、限流以及启用时的 Turnstile。已配置真实沟通
过滤在网页/API 工单及回复写入前执行，拒绝返回 400，验证不可用返回 503。
多语言行为见[语言](/docs/zh/guides/languages)。
