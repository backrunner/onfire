import { describe, expect, it } from "vitest";
import { tocPath } from "@/lib/toc-path";

describe("ToC browser paths", () => {
  it("prefixes routes only when mounted below /support", () => {
    expect(tocPath("/api/toc/whoami", "/support")).toBe(
      "/support/api/toc/whoami"
    );
    expect(tocPath("/tickets/1", "/support/tickets/1")).toBe(
      "/support/tickets/1"
    );
    expect(tocPath("/", "/support")).toBe("/support");
    expect(tocPath("/api/toc/whoami", "/")).toBe("/api/toc/whoami");
  });
});
