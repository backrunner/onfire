import { describe, expect, it } from "vitest";
import { filteredInputContent } from "./filtered-input-content";

describe("filtered input review content", () => {
  it("separates attachment thumbnails and remote images without loading markup", () => {
    const result = filteredInputContent('<p>Account issue</p><a href="https://example.com"><img src="/api/attachments/ab123" alt="Error &amp; details"></a><img src="https://example.com/screen?a=1&amp;b=2"><img src="/api/attachments/ab123">');
    expect(result.reviewHtml).toBe("<p>Account issue</p>");
    expect(result.reviewImages).toEqual([
      { src: "/api/attachments/ab123", alt: "Error & details", remote: false },
      { src: "https://example.com/screen?a=1&b=2", alt: "", remote: true },
    ]);
  });

  it("rejects unsafe images and active content before extracting any attributes", () => {
    const result = filteredInputContent('<script><img src="https://evil.example"></script><img src="jav&#x61;script:alert(1)"><img src="data:image/svg+xml;base64,abc"><img src="/api/tob/private"><img src="//evil.example"><img src="https://example.com/safe.png" alt="&quot; onerror=&quot;alert(1)" onerror="alert(1)"><p>&lt;img src=x onerror=alert(1)&gt;</p>');
    expect(result.reviewHtml).toBe("<p>&lt;img src=x onerror=alert(1)&gt;</p>");
    expect(result.reviewImages).toEqual([{ src: "https://example.com/safe.png", alt: '" onerror="alert(1)', remote: true }]);
  });

  it("supports inline raster images and empty or image-only input", () => {
    expect(filteredInputContent(null)).toEqual({ reviewHtml: null, reviewImages: [] });
    expect(filteredInputContent('<img src="data:image/png;base64,YWJj">')).toEqual({ reviewHtml: "", reviewImages: [{ src: "data:image/png;base64,YWJj", alt: "", remote: false }] });
    expect(filteredInputContent("<p>Plain text</p>")).toEqual({ reviewHtml: "<p>Plain text</p>", reviewImages: [] });
  });
});
