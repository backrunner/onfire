import { describe, expect, it, vi } from "vitest";
import type { McpGrantContext } from "./grants";
import {
  getMcpProductSettings,
  listMcpProducts,
  updateMcpProductSettings,
} from "./settings-operations";

describe("MCP product settings writes", () => {
  it.each([
    {
      name: "product list",
      permission: "settings:read",
      run: (ctx: McpGrantContext) => listMcpProducts(ctx),
    },
    {
      name: "settings detail",
      permission: "settings:read",
      run: (ctx: McpGrantContext) =>
        getMcpProductSettings(ctx, "product-1"),
    },
    {
      name: "settings update",
      permission: "settings:write",
      run: (ctx: McpGrantContext) =>
        updateMcpProductSettings(ctx, {
          productId: "product-1",
          name: "Renamed product",
        }),
    },
  ] as const)(
    "checks $permission inside the $name operation before database access",
    async ({ permission, run }) => {
      const databaseAccess = vi.fn();
      const context = {
        db: new Proxy(
          {},
          {
            get: (_target, property) => {
              databaseAccess(property);
              return undefined;
            },
          },
        ),
        mcpPermissions: [],
      } as unknown as McpGrantContext;

      await expect(run(context)).rejects.toMatchObject({
        status: 403,
        message: `MCP permission required: ${permission}`,
      });
      expect(databaseAccess).not.toHaveBeenCalled();
    },
  );

  it("returns an explicit non-secret projection", async () => {
    const product = {
      id: "product-1",
      tenantId: "tenant-1",
      name: "Product",
      homepageUrl: "https://product.example.com",
      portalReturnUrl: null,
      slaHighAccept: 10,
      slaHighReply: 20,
      slaMediumAccept: 30,
      slaMediumReply: 40,
      slaLowAccept: 50,
      slaLowReply: 60,
      autoCloseMinutes: 120,
      futureSecretField: "must-not-leak",
    };
    const context = {
      db: {
        query: {
          products: { findFirst: vi.fn().mockResolvedValue(product) },
          productIdentityConfigs: {
            findFirst: vi.fn().mockResolvedValue({
              enabled: true,
              endpointUrl: "https://identity.example.com/private",
              authSecret: "sealed-secret",
            }),
          },
        },
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([{ teamId: "team-1" }]),
          })),
        })),
      },
      isSuperAdmin: true,
      tenantIds: [],
      teamIds: [],
      productIds: [],
      mcpPermissions: ["settings:read"],
    } as unknown as McpGrantContext;

    const result = await getMcpProductSettings(context, "product-1");

    expect(result).toEqual({
      product: {
        id: "product-1",
        tenantId: "tenant-1",
        name: "Product",
        homepageUrl: "https://product.example.com",
        portalReturnUrl: null,
        slaHighAccept: 10,
        slaHighReply: 20,
        slaMediumAccept: 30,
        slaMediumReply: 40,
        slaLowAccept: 50,
        slaLowReply: 60,
        autoCloseMinutes: 120,
        teamIds: ["team-1"],
        identityEnabled: true,
        identitySecretConfigured: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("identity.example.com");
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("returns only the fields written when read access was not granted", async () => {
    const persisted: Array<Record<string, unknown>> = [];
    const context = {
      db: {
        query: {
          products: {
            findFirst: vi
              .fn()
              .mockResolvedValue({ id: "product-1", tenantId: "tenant-1" }),
          },
        },
        update: vi.fn(() => ({
          set: (fields: Record<string, unknown>) => ({
            where: async () => {
              persisted.push(fields);
            },
          }),
        })),
      },
      isSuperAdmin: true,
      tenantIds: [],
      teamIds: [],
      productIds: [],
      mcpPermissions: ["settings:write"],
    } as unknown as McpGrantContext;

    await expect(
      updateMcpProductSettings(context, {
        productId: "product-1",
        name: "Renamed product",
        slaHighReply: 30,
      }),
    ).resolves.toEqual({
      productId: "product-1",
      updated: { name: "Renamed product", slaHighReply: 30 },
    });
    expect(persisted).toEqual([
      { name: "Renamed product", slaHighReply: 30 },
    ]);
  });
});
