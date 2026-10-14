---
title: 权限与角色
description: 区分角色能力、实时资源范围和客服成员身份。
order: 4
---

## 角色范围

| 角色 | 管理范围 |
| --- | --- |
| SuperAdmin | 实例级系统与租户管理 |
| TenantAdmin | 自己租户的产品、团队和允许管理的人员 |
| ProductAdmin | 通过 `user_products` 分配的产品及产品团队 |
| TeamAdmin | 自己团队、工单和范围内通知设置 |
| Agent | 通过有效团队成员身份可见的工单 |

角色不能绕过租户一致性。提交的租户、产品和团队关联必须属于同一业务范围，即使
SuperAdmin 也一样。删除有依赖记录的租户/产品/团队返回 409，不会静默删除关联数据。

`product.manage` 控制产品创建/删除；`product.settings` 控制 SLA、自动关闭和团队
关联等配置。ProductAdmin 可配置已分配产品，但不获得产品生命周期权限。工单类型
编写与团队路由配置分开：TeamAdmin 可配置可见类型的路由，不能编写类型树或表单。

## 设置入口

SuperAdmin 的配置首页是系统管理；TenantAdmin 进入自己的租户，不显示全局租户
列表；ProductAdmin 只看到已分配产品，不显示租户页签。TeamAdmin 和 Agent 没有
管理入口。邮件、通知与 AI/知识设置位于对应范围内。
系统 AI 仅限 SuperAdmin；TenantAdmin 可管理租户 AI，TenantAdmin/ProductAdmin
可管理可访问的产品 AI。

## 账户与客服

系统账户提供登录身份和 RBAC；有效客服状态与团队成员身份单独决定工单分配和回复
资格。管理员也能成为客服。产品管理员可把已有租户用户加入产品团队，不能改变全局
客服等级或有效状态。系统团队仅限 SuperAdmin，且不参与租户通知继承。

## 只读预览

SuperAdmin 和 TenantAdmin 可以预览范围内严格较低角色的用户。认证会话仍为操作者，
API 使用目标用户当前角色和资源范围。除进入/退出预览外禁止写入，侧栏持续显示预览
标识。账户 Key 和安全管理仅限真实浏览器会话；远程 MCP 不继承预览身份。

UI 显隐只负责呈现，每个 API 都检查实时角色、归属和目标范围。角色或成员身份丢失
会在下一次授权时缩小[账户 Key](/docs/zh/guides/account-api-keys)和
[MCP 委托](/docs/zh/guides/automation)的权限。
