import { describe, it, expect } from "vitest";
import {
  generateProductKeySecret,
  verifyProductApiKey,
} from "@/lib/auth/api-key";
import type { Database } from "@/lib/db";

function fakeDb(row: { id: string; secretHash: string; productId: string; revoked?: boolean } | null) {
  return {
    query: {
      productKeys: {
        findFirst: async () => (row ? { revoked: false, ...row } : undefined),
      },
    },
  } as unknown as Database;
}

describe("product API keys", () => {
  it("round-trips: generated key verifies against its stored hash", async () => {
    const generated = await generateProductKeySecret();
    const db = fakeDb({
      id: generated.id,
      secretHash: generated.secretHash,
      productId: "prod-1",
    });
    const verified = await verifyProductApiKey(db, generated.plaintext);
    expect(verified).toEqual({ id: generated.id, productId: "prod-1" });
  });

  it("rejects a wrong secret", async () => {
    const generated = await generateProductKeySecret();
    const db = fakeDb({
      id: generated.id,
      secretHash: generated.secretHash,
      productId: "prod-1",
    });
    expect(await verifyProductApiKey(db, `${generated.id}.deadbeef`)).toBeNull();
  });

  it("rejects revoked keys", async () => {
    const generated = await generateProductKeySecret();
    const db = fakeDb({
      id: generated.id,
      secretHash: generated.secretHash,
      productId: "prod-1",
      revoked: true,
    });
    expect(await verifyProductApiKey(db, generated.plaintext)).toBeNull();
  });

  it("rejects malformed credentials", async () => {
    const db = fakeDb(null);
    expect(await verifyProductApiKey(db, "no-dot-here")).toBeNull();
    expect(await verifyProductApiKey(db, ".starts-with-dot")).toBeNull();
    expect(await verifyProductApiKey(db, "ends-with-dot.")).toBeNull();
  });

  it("never stores the plaintext secret", async () => {
    const generated = await generateProductKeySecret();
    const secretPart = generated.plaintext.split(".")[1];
    expect(generated.secretHash).not.toContain(secretPart);
    expect(generated.secretHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
