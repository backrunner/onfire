import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ApiError } from "@/lib/api/response";

export function mcpToolResult(data: Record<string, unknown>): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}

export function mcpToolError(error: unknown): CallToolResult {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? "The OnFire operation failed"
        : "The OnFire operation failed";

  if (!(error instanceof ApiError)) {
    console.error("MCP tool error:", error);
  }

  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

export async function runMcpTool(
  operation: () => Promise<Record<string, unknown>>,
): Promise<CallToolResult> {
  try {
    return mcpToolResult(await operation());
  } catch (error) {
    return mcpToolError(error);
  }
}
