const INVALID_TOKEN_DESCRIPTIONS = new Set([
  "Invalid access token",
  "opaque access token not found",
  "refresh token revoked",
  "token not found",
]);

export function mcpRevocationSuccessResponse(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

/** RFC 7009 makes revocation idempotent and hides whether a token exists. */
export async function normalizeMcpRevocationResponse(
  response: Response,
): Promise<Response> {
  if (response.status !== 400) return response;
  const mediaType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") return response;

  const payload: unknown = await response.clone().json().catch(() => null);
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("error" in payload) ||
    payload.error !== "invalid_request" ||
    !("error_description" in payload) ||
    typeof payload.error_description !== "string" ||
    !INVALID_TOKEN_DESCRIPTIONS.has(payload.error_description)
  ) {
    return response;
  }

  return mcpRevocationSuccessResponse();
}
