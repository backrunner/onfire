import { describe, expect, it } from "vitest";
import type { ReplyRow, TicketRow } from "@/drizzle/schema";
import { TicketPriority, TicketStatus } from "@/lib/types";
import {
  serializeReplyForAgent,
  serializeReplyForCustomer,
  serializeTicketForCustomer,
} from "./serialize";

describe("serializeTicketForCustomer", () => {
  it("omits internal ticket type and template version identifiers", () => {
    const ticket = {
      id: "ticket-1",
      tenantId: "tenant-1",
      productId: "product-1",
      teamId: "team-1",
      status: TicketStatus.New,
      priority: TicketPriority.Medium,
      subject: "Need help",
      content: "The application is unavailable",
      ticketTypeId: "type-1",
      templateVersionId: "version-2",
      ticketTypePath: JSON.stringify([{ id: "type-1", name: "Incident" }]),
      metadata: JSON.stringify({ environment: "production" }),
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    } as TicketRow;

    const result = serializeTicketForCustomer(ticket, "en");

    expect(result).toMatchObject({
      id: "ticket-1",
      metadata: { environment: "production" },
    });
    expect(result).not.toHaveProperty("ticketTypeId");
    expect(result).not.toHaveProperty("templateVersionId");
    expect(result).not.toHaveProperty("ticketTypePath");
  });

  it("returns one projected language without translation caches or originals", () => {
    const ticket = {
      id: "ticket-1",
      productId: "product-1",
      status: TicketStatus.Processing,
      priority: TicketPriority.High,
      subject: "Need help",
      content: "The application is unavailable",
      subjectTranslations: '{"zh":"需要帮助"}',
      contentTranslations: '{"zh":"应用不可用"}',
      metadata: null,
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    } as TicketRow;

    const result = serializeTicketForCustomer(ticket, "zh");

    expect(result.subject).toBe("需要帮助");
    expect(result.content).toBe("应用不可用");
    expect(result).not.toHaveProperty("subjectTranslations");
    expect(result).not.toHaveProperty("contentTranslations");
    expect(result).not.toHaveProperty("originalSubject");
    expect(result).not.toHaveProperty("customerLanguage");
  });
});

describe("reply serialization", () => {
  const reply = {
    id: "reply-1",
    ticketId: "ticket-1",
    senderId: "agent-1",
    senderEmail: null,
    content: "We are checking",
    contentHtml: "<p>We are checking</p>",
    detectedLanguage: "en",
    translations:
      '{"zh":{"content":"我们正在检查","contentHtml":"<p>我们正在检查</p>"}}',
    internal: false,
    source: "web",
    sourceEmailId: null,
    emailSent: false,
    createdAt: "2026-07-16T00:00:00.000Z",
  } as ReplyRow;

  it("shows customers only the projected reply", () => {
    const result = serializeReplyForCustomer(reply, "zh");

    expect(result.content).toBe("我们正在检查");
    expect(result.contentHtml).toBe("<p>我们正在检查</p>");
    expect(result).not.toHaveProperty("translations");
    expect(result).not.toHaveProperty("detectedLanguage");
    expect(result).not.toHaveProperty("originalContent");
  });

  it("keeps the customer-facing projection available to agents for review", () => {
    const result = serializeReplyForAgent(reply, "en");

    expect(result.content).toBe("We are checking");
    expect(result.translations.zh?.content).toBe("我们正在检查");
  });
});
