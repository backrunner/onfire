import { describe, expect, it } from "vitest";
import {
  isSealedSecret,
  openSecret,
  openStoredSecret,
  sealSecret,
} from "@/lib/secret-storage";

describe("sealed configuration secrets", () => {
  it("round-trips without embedding plaintext", async () => {
    const sealed = await sealSecret(
      "resolver-secret-value",
      "master-secret",
      "identity"
    );
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("resolver-secret-value");
    await expect(
      openSecret(sealed, "master-secret", "identity")
    ).resolves.toBe("resolver-secret-value");
  });

  it("fails closed for the wrong key, purpose, or malformed value", async () => {
    const sealed = await sealSecret("secret", "master", "identity");
    await expect(openSecret(sealed, "wrong", "identity")).rejects.toThrow();
    await expect(openSecret(sealed, "master", "other")).rejects.toThrow();
    await expect(openSecret("broken", "master", "identity")).rejects.toThrow();
  });

  it("opens legacy plaintext while recognizing sealed values", async () => {
    const sealed = await sealSecret("secret", "master", "identity");
    expect(isSealedSecret(sealed)).toBe(true);
    expect(isSealedSecret("legacy-secret")).toBe(false);
    await expect(
      openStoredSecret("legacy-secret", "master", "identity")
    ).resolves.toBe("legacy-secret");
    await expect(
      openStoredSecret(sealed, "master", "identity")
    ).resolves.toBe("secret");
  });
});
