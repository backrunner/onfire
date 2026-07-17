import { describe, expect, it } from "vitest";
import {
  notificationChannelTypesSchema,
  notificationRecipientTypeSchema,
  notificationRequirementScopeSchema,
  notificationTriggerEventsSchema,
  toNotificationRequirementView,
  toNotificationRuleView,
} from "./policy-schema";
import type {
  NotificationRequirementRow,
  NotificationRuleRow,
} from "@/drizzle/schema";

describe("notification policy schemas", () => {
  it("accepts the extensible channel registry and recipient selectors", () => {
    expect(
      notificationChannelTypesSchema.parse(["email", "slack", "feishu", "wecom"])
    ).toEqual(["email", "slack", "feishu", "wecom"]);
    expect(notificationRecipientTypeSchema.parse("ticket_team")).toBe("ticket_team");
    expect(notificationRequirementScopeSchema.parse("user")).toBe("user");
    expect(notificationTriggerEventsSchema.parse(["ticket_expiring"])).toEqual([
      "ticket_expiring",
    ]);
  });

  it("parses persisted rule and requirement arrays for API views", () => {
    const rule = toNotificationRuleView({
      triggerEvents: JSON.stringify(["customer_replied"]),
      channelTypes: JSON.stringify(["bark", "teams"]),
    } as NotificationRuleRow);
    expect(rule.triggerEvents).toEqual(["customer_replied"]);
    expect(rule.channelTypes).toEqual(["bark", "teams"]);

    const requirement = toNotificationRequirementView({
      triggerEvents: JSON.stringify(["ticket_assigned"]),
      channelTypes: JSON.stringify(["email"]),
    } as NotificationRequirementRow);
    expect(requirement.triggerEvents).toEqual(["ticket_assigned"]);
    expect(requirement.channelTypes).toEqual(["email"]);
  });
});
