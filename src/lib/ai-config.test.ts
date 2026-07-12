import { describe, expect, it } from "vitest";
import { isSafeAIBaseUrl, safeAIBaseUrl } from "@/lib/ai-config";

describe("AI base URL validation", () => {
  it("normalizes public HTTPS gateway paths", () => {
    expect(safeAIBaseUrl("https://gateway.example.com/v1/")).toBe(
      "https://gateway.example.com/v1"
    );
    expect(isSafeAIBaseUrl("https://gateway.example.com/v1")).toBe(true);
  });

  it("rejects local, non-HTTPS, query, and credential-bearing URLs", () => {
    expect(safeAIBaseUrl("http://gateway.example.com/v1")).toBeNull();
    expect(safeAIBaseUrl("https://localhost/v1")).toBeNull();
    expect(safeAIBaseUrl("https://gateway.example.com/v1?key=value")).toBeNull();
    expect(safeAIBaseUrl("https://user:pass@gateway.example.com/v1")).toBeNull();
    expect(isSafeAIBaseUrl(undefined)).toBe(true);
  });
});
