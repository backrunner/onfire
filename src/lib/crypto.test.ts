import { describe, it, expect } from "vitest";
import {
  sha256Hex,
  hmacSha256Hex,
  timingSafeEqual,
  randomHex,
} from "@/lib/crypto";

describe("crypto helpers", () => {
  it("sha256Hex produces the known digest", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("hmacSha256Hex matches RFC 4231 test case 2", async () => {
    expect(await hmacSha256Hex("what do ya want for nothing?", "Jefe")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
    );
  });

  it("signs raw webhook bytes without a UTF-8 decode round trip", async () => {
    const raw = new Uint8Array([0xff, 0x00, 0x7f]);
    expect(await hmacSha256Hex(raw, "secret")).not.toBe(
      await hmacSha256Hex(new TextDecoder().decode(raw), "secret")
    );
  });

  it("timingSafeEqual compares correctly", async () => {
    expect(await timingSafeEqual("same", "same")).toBe(true);
    expect(await timingSafeEqual("same", "diff")).toBe(false);
    expect(await timingSafeEqual("short", "longer-string")).toBe(false);
    expect(await timingSafeEqual("", "")).toBe(true);
  });

  it("randomHex returns the requested number of bytes as hex", () => {
    const hex = randomHex(32);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(randomHex(16)).not.toBe(randomHex(16));
  });
});
