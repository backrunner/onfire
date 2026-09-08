import { describe, expect, it, vi } from "vitest";
import {
  getCredentialCooldownUntil,
  runWithCredentialFailover,
  type RoutedCredential,
} from "./config";

function candidate(id: string, cooldownSeconds = 60): RoutedCredential {
  return {
    id,
    name: id,
    provider: "openai",
    apiMode: "responses",
    encryptedApiKey: "sealed",
    secretPurpose: `ai-credential:${id}`,
    baseUrl: null,
    model: "gpt-5.4-mini",
    modelKind: "text",
    modelDimensions: null,
    priority: 0,
    cooldownSeconds,
    blockedUntil: null,
  };
}

describe("AI credential failover", () => {
  it("tries the next credential after a failure", async () => {
    const first = candidate("first");
    const second = candidate("second");
    const onSuccess = vi.fn(async () => undefined);
    const onFailure = vi.fn(async () => undefined);

    const result = await runWithCredentialFailover(
      [first, second],
      async (item) => {
        if (item.id === "first") throw new Error("rate limited");
        return "ok";
      },
      onSuccess,
      onFailure
    );

    expect(result).toBe("ok");
    expect(onFailure).toHaveBeenCalledWith(first, expect.any(Error), true);
    expect(onSuccess).toHaveBeenCalledWith(second);
  });

  it("does not mark the final credential as having a fallback", async () => {
    const only = candidate("only");
    const onFailure = vi.fn(async () => undefined);

    await expect(
      runWithCredentialFailover(
        [only],
        async () => {
          throw new Error("offline");
        },
        async () => undefined,
        onFailure
      )
    ).rejects.toThrow("offline");

    expect(onFailure).toHaveBeenCalledWith(only, expect.any(Error), false);
  });

  it("calculates cooldown only when another credential is available", () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    expect(getCredentialCooldownUntil(90, true, now)).toBe(
      "2026-07-13T00:01:30.000Z"
    );
    expect(getCredentialCooldownUntil(90, false, now)).toBeNull();
  });
});
