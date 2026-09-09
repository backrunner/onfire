---
title: Access and roles
description: Keep permissions and resource scope together at every boundary.
order: 4
---

The role hierarchy is `SuperAdmin → TenantAdmin → ProductAdmin → TeamAdmin → Agent`. Role permissions describe what a person can do; tenant, product, and team membership describe where they can do it.

Product lifecycle permission is separate from product settings. Product admins can configure an assigned product without creating or deleting products. Support-agent membership is separate from the system account used to log in.

SuperAdmins and TenantAdmins can preview a strictly lower role. Preview is read-only, and MCP grants never inherit preview identity. Every API mutation rechecks live identity, permission, and tenant integrity.
