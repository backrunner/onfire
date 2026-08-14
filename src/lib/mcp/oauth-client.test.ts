import { describe, expect, it } from "vitest";
import {
  hasValidMcpRedirectUris,
  isMcpLoopbackHostname,
  isMcpPublicClientMetadata,
  matchesRegisteredMcpRedirectUri,
  parseMcpRedirectUri,
} from "./oauth-client";

describe("MCP OAuth client redirect profile", () => {
  it.each([
    "https://client.example.com/callback",
    "http://localhost:3000/callback",
    "http://127.0.0.1:3000/callback",
    "http://[::1]:3000/callback",
  ])("accepts HTTPS or an exact HTTP loopback callback: %s", (value) => {
    expect(parseMcpRedirectUri(value)).not.toBeNull();
  });

  it.each([
    "http://client.example.com/callback",
    "http://127.0.0.2:3000/callback",
    "http://127.1:3000/callback",
    "http://2130706433:3000/callback",
    "http://localhost.:3000/callback",
    "http://localhost.example.com/callback",
    "com.example.app:/oauth2redirect",
    "https://user:password@client.example.com/callback",
    "https://client.example.com/callback#fragment",
    " https://client.example.com/callback",
    "https:client.example.com/callback",
    "https:\\\\client.example.com\\callback",
  ])("rejects a callback outside the MCP profile: %s", (value) => {
    expect(parseMcpRedirectUri(value)).toBeNull();
  });

  it("recognizes only the approved loopback hostnames", () => {
    expect(isMcpLoopbackHostname("localhost")).toBe(true);
    expect(isMcpLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isMcpLoopbackHostname("[::1]")).toBe(true);
    expect(isMcpLoopbackHostname("127.0.0.2")).toBe(false);
  });

  it("allows native HTTP loopback port variance but otherwise requires exact strings", () => {
    const registered = ["http://localhost:9876/callback?source=desktop"];
    expect(
      matchesRegisteredMcpRedirectUri(
        registered,
        "http://localhost:43119/callback?source=desktop",
        "native",
      ),
    ).toBe(true);
    expect(
      matchesRegisteredMcpRedirectUri(
        registered,
        "http://localhost:43119/callback?source=other",
        "native",
      ),
    ).toBe(false);
    expect(
      matchesRegisteredMcpRedirectUri(
        registered,
        "http://localhost:43119/callback?source=desktop",
        "web",
      ),
    ).toBe(false);
  });

  it("fails a persisted client closed when any callback violates the profile", () => {
    const client = {
      applicationType: "native",
      clientDiscoveryId: null,
      dpopBoundAccessTokens: false,
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: [
        "http://127.0.0.1:9876/callback",
        "com.example.app:/oauth2redirect",
      ],
      requirePKCE: true,
      responseTypes: ["code"],
      skipConsent: false,
      tokenEndpointAuthMethod: "none",
    };

    expect(hasValidMcpRedirectUris(client.redirectUris, "native")).toBe(false);
    expect(isMcpPublicClientMetadata(client)).toBe(false);
  });

  it("reapplies DCR callback bounds to persisted client metadata", () => {
    expect(
      hasValidMcpRedirectUris(
        Array.from(
          { length: 21 },
          (_, index) => `https://client${index}.example.com/callback`,
        ),
        "native",
      ),
    ).toBe(false);
    expect(
      hasValidMcpRedirectUris(
        [`https://client.example.com/${"x".repeat(2049)}`],
        "native",
      ),
    ).toBe(false);
  });
});
