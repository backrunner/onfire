import { afterEach, describe, expect, it, vi } from "vitest";
import { extractThreadMessageIds } from "./inbound";
import { buildThreadHeaders, htmlToText } from "./outbound";
import {
  EMAIL_TEMPLATE_SAMPLE_VARIABLES,
  getDefaultBodyTemplate,
  emailTemplateMarkupIssues,
  renderEmailTemplate,
  sanitizeEmailTemplateHtml,
} from "@/lib/email-templates";
import { MailerooProvider } from "./providers/maileroo";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("email content and threading", () => {
  it("normalizes message-id forms used by different providers", () => {
    expect(
      extractThreadMessageIds(
        "<reply@example.com> (provider comment)",
        "<first@example.com> <second@example.com>"
      )
    ).toEqual(
      expect.arrayContaining([
        "<reply@example.com>",
        "reply@example.com",
        "<first@example.com>",
        "first@example.com",
        "<second@example.com>",
        "second@example.com",
      ])
    );
  });

  it("builds a readable text fallback for HTML-only messages", () => {
    expect(
      htmlToText("<p>Hello &amp; welcome</p><blockquote>Line 2</blockquote>")
    ).toBe("Hello & welcome\nLine 2");
  });

  it("builds bounded RFC threading headers from the prior provider id", () => {
    expect(buildThreadHeaders("previous@example.com")).toEqual({
      "In-Reply-To": "<previous@example.com>",
      References: "<previous@example.com>",
    });
    expect(buildThreadHeaders("bad\r\nBcc: attacker@example.com")).toBeUndefined();
  });

  it("renders the same customizable default used by the preview", () => {
    const html = renderEmailTemplate(
      getDefaultBodyTemplate("ticket_replied"),
      EMAIL_TEMPLATE_SAMPLE_VARIABLES,
      { html: true }
    );
    expect(html).toContain("Morgan has replied");
    expect(html).toContain("Unable to access the analytics dashboard");
  });

  it("escapes customer-controlled variables inside custom HTML", () => {
    const html = renderEmailTemplate(
      "<div>{{reply_content}}</div>",
      { ...EMAIL_TEMPLATE_SAMPLE_VARIABLES, reply_content: "<script>alert(1)</script>" },
      { html: true }
    );
    expect(html).toBe("<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>");
  });

  it("rejects and sanitizes active email markup", () => {
    const template = '<div onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">x</a></div>';
    expect(emailTemplateMarkupIssues(template)).not.toEqual([]);
    expect(sanitizeEmailTemplateHtml(template)).toBe("<div><a>x</a></div>");
  });

  it("uses Maileroo's current v2 payload and preserves thread headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
        message: "queued",
        data: { reference_id: "maileroo-ref" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new MailerooProvider("secret").send({
      to: "customer@example.com",
      from: "support@example.com",
      fromName: "Support",
      replyTo: "reply@example.com",
      subject: "Update",
      html: "<p>Done</p>",
      text: "Done",
      headers: { "In-Reply-To": "<previous@example.com>" },
    });

    expect(result).toEqual({ success: true, messageId: "maileroo-ref" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://smtp.maileroo.com/api/v2/emails",
      expect.objectContaining({ method: "POST" })
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      from: { address: "support@example.com", display_name: "Support" },
      to: [{ address: "customer@example.com" }],
      reply_to: { address: "reply@example.com" },
      headers: { "In-Reply-To": "<previous@example.com>" },
    });
  });
});
