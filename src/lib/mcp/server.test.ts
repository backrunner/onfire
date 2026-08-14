import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { McpGrantContext } from "./grants";
import { createMcpServer } from "./server";

function registeredTools(server: McpServer): string[] {
  return Object.keys(
    (
      server as unknown as {
        _registeredTools: Record<string, unknown>;
      }
    )._registeredTools,
  ).sort();
}

function context(permissions: McpGrantContext["mcpPermissions"]): McpGrantContext {
  return { mcpPermissions: permissions } as McpGrantContext;
}

describe("MCP tool exposure", () => {
  it("exposes only ticket read tools for a read-only grant", () => {
    const server = createMcpServer(context(["tickets:read"]));
    expect(registeredTools(server)).toEqual(["get_ticket", "list_tickets"]);
  });

  it("keeps assignment and reassignment atomic", () => {
    expect(
      registeredTools(createMcpServer(context(["tickets:assign"]))),
    ).toEqual(["assign_ticket", "list_ticket_agents"]);
    expect(
      registeredTools(createMcpServer(context(["tickets:reassign"]))),
    ).toEqual(["list_ticket_agents", "reassign_ticket"]);
  });

  it("exposes product reads and writes independently", () => {
    expect(
      registeredTools(createMcpServer(context(["settings:read"]))),
    ).toEqual(["get_product_settings", "list_products"]);
    expect(
      registeredTools(createMcpServer(context(["settings:write"]))),
    ).toEqual(["update_product_settings"]);
  });

  it("serves tools/list through the stateless Web Standard transport", async () => {
    const server = createMcpServer(context(["tickets:read"]));
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const response = await transport.handleRequest(
      new Request("https://admin.example.com/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-03-26",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      }),
    );
    const body = (await response.json()) as {
      result?: { tools?: Array<{ name: string }> };
    };
    await server.close();

    expect(response.status).toBe(200);
    expect(body.result?.tools?.map((tool) => tool.name).sort()).toEqual([
      "get_ticket",
      "list_tickets",
    ]);
  });
});
