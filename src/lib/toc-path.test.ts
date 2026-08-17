import { describe, expect, it } from "vitest";
import { rewriteTocAttachmentUrls, tocPath } from "@/lib/toc-path";

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

  it("rewrites attachment URLs in reply HTML only behind /support", () => {
    const html =
      '<p>hi</p><img src="/api/attachments/abc123" alt=""><img src="https://cdn.example.com/x.png">';
    expect(rewriteTocAttachmentUrls(html, "/support/tickets/1")).toBe(
      '<p>hi</p><img src="/support/api/attachments/abc123" alt=""><img src="https://cdn.example.com/x.png">'
    );
    expect(rewriteTocAttachmentUrls(html, "/tickets/1")).toBe(html);
  });
});
