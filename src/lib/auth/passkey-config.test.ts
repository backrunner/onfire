import { describe, expect, it } from "vitest";
import { getPasskeyRelyingParty } from "./passkey-config";

describe("getPasskeyRelyingParty", () => {
  it("uses the production auth host as the WebAuthn RP boundary", () => {
    expect(
      getPasskeyRelyingParty("https://onfire.alkinum.com/api/tob/auth"),
    ).toEqual({
      rpID: "onfire.alkinum.com",
      rpName: "OnFire",
      origin: "https://onfire.alkinum.com",
    });
  });

  it("preserves the localhost port only in the allowed origin", () => {
    expect(getPasskeyRelyingParty("http://localhost:3001")).toEqual({
      rpID: "localhost",
      rpName: "OnFire",
      origin: "http://localhost:3001",
    });
  });
});
