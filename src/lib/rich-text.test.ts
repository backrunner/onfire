import { describe, expect, it } from "vitest";
import {
  richHtmlToText,
  richTextIsEmpty,
  sanitizeRichHtml,
} from "./rich-text";

describe("sanitizeRichHtml", () => {
  it("keeps basic formatting tags", () => {
    expect(sanitizeRichHtml("<p>Hello <strong>world</strong></p>")).toBe(
      "<p>Hello <strong>world</strong></p>"
    );
    expect(
      sanitizeRichHtml("<ul><li>one</li><li>two</li></ul>")
    ).toBe("<ul><li>one</li><li>two</li></ul>");
  });

  it("escapes raw text and stray angle brackets", () => {
    expect(sanitizeRichHtml("1 < 2 & 3 > 0")).toBe("1 &lt; 2 &amp; 3 &gt; 0");
  });

  it("drops script/style subtrees entirely", () => {
    expect(
      sanitizeRichHtml('<p>a</p><script>alert(1)</script><style>body{}</style>')
    ).toBe("<p>a</p>");
  });

  it("drops svg and nested payloads", () => {
    expect(
      sanitizeRichHtml('<svg><script>alert(1)</script></svg><p>ok</p>')
    ).toBe("<p>ok</p>");
  });

  it("unwraps unknown tags but keeps their text", () => {
    expect(sanitizeRichHtml("<table><tr><td>cell</td></tr></table>")).toBe(
      "cell"
    );
  });

  it("strips event handler attributes", () => {
    expect(
      sanitizeRichHtml('<p onclick="alert(1)">x</p>')
    ).toBe("<p>x</p>");
  });

  it("strips style and class attributes", () => {
    expect(
      sanitizeRichHtml('<p style="color:red" class="x">x</p>')
    ).toBe("<p>x</p>");
  });

  it("rejects javascript: links, including entity-encoded schemes", () => {
    expect(sanitizeRichHtml('<a href="javascript:alert(1)">x</a>')).toBe(
      "<a>x</a>"
    );
    expect(
      sanitizeRichHtml('<a href="&#106;avascript:alert(1)">x</a>')
    ).toBe("<a>x</a>");
    expect(sanitizeRichHtml('<a href="java\tscript:alert(1)">x</a>')).toBe(
      "<a>x</a>"
    );
  });

  it("keeps https links and forces safe target/rel", () => {
    expect(sanitizeRichHtml('<a href="https://example.com/a">x</a>')).toBe(
      '<a href="https://example.com/a" target="_blank" rel="noopener noreferrer nofollow">x</a>'
    );
  });

  it("drops images with untrusted sources", () => {
    expect(sanitizeRichHtml('<img src="javascript:alert(1)">')).toBe("");
    expect(sanitizeRichHtml('<img src="cid:att-1">')).toBe("");
    expect(sanitizeRichHtml('<img src="data:text/html;base64,PGI+">')).toBe(
      ""
    );
    expect(sanitizeRichHtml('<img src="x" onerror="alert(1)">')).toBe("");
  });

  it("keeps https, data-image, and attachment images", () => {
    expect(sanitizeRichHtml('<img src="https://cdn.example.com/a.png">')).toBe(
      '<img src="https://cdn.example.com/a.png" loading="lazy">'
    );
    expect(
      sanitizeRichHtml('<img src="data:image/png;base64,iVBORw0KGgo=">')
    ).toBe('<img src="data:image/png;base64,iVBORw0KGgo=" loading="lazy">');
    expect(sanitizeRichHtml('<img src="/api/attachments/abc123">')).toBe(
      '<img src="/api/attachments/abc123" loading="lazy">'
    );
  });

  it("rejects attachment paths that escape the prefix", () => {
    expect(sanitizeRichHtml('<img src="/api/attachments/../admin">')).toBe("");
    expect(sanitizeRichHtml('<img src="/api/attachments/a?x=1">')).toBe("");
  });

  it("closes tags left open by truncated input", () => {
    expect(sanitizeRichHtml("<blockquote><p>hi")).toBe(
      "<blockquote><p>hi</p></blockquote>"
    );
  });

  it("ignores unmatched closing tags", () => {
    expect(sanitizeRichHtml("hi</p></div>")).toBe("hi");
  });

  it("escapes attribute breakouts", () => {
    expect(
      sanitizeRichHtml('<a href="https://x.com/" onclick="evil()">y</a>')
    ).toBe(
      '<a href="https://x.com/" target="_blank" rel="noopener noreferrer nofollow">y</a>'
    );
  });
});

describe("richHtmlToText", () => {
  it("converts paragraphs, breaks, and lists to plain text", () => {
    expect(richHtmlToText("<p>a</p><p>b<br>c</p><ul><li>d</li></ul>")).toBe(
      "a\n\nb\nc\n\n• d"
    );
  });

  it("decodes entities and drops scripts", () => {
    expect(richHtmlToText("<script>x</script>Tom &amp; Jerry")).toBe(
      "Tom & Jerry"
    );
  });
});

describe("richTextIsEmpty", () => {
  it("treats whitespace-only markup as empty", () => {
    expect(richTextIsEmpty("<p>  </p><p><br></p>")).toBe(true);
    expect(richTextIsEmpty("")).toBe(true);
  });

  it("treats text or images as content", () => {
    expect(richTextIsEmpty("<p>hi</p>")).toBe(false);
    expect(
      richTextIsEmpty('<p></p><img src="/api/attachments/abc123">')
    ).toBe(false);
  });
});
