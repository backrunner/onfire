import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultEmailEndpoint,
  DEFAULT_EMAIL_ENDPOINT_NAME,
} from "./default-email-endpoint";

describe("createDefaultEmailEndpoint", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates an enabled email endpoint from the account email", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001"
    );

    expect(
      createDefaultEmailEndpoint(
        "user-1",
        "agent@example.com",
        "2026-08-11T00:00:00.000Z"
      )
    ).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      userId: "user-1",
      channelType: "email",
      name: DEFAULT_EMAIL_ENDPOINT_NAME,
      enabled: true,
      config: JSON.stringify({ email: "agent@example.com" }),
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
    });
  });
});
