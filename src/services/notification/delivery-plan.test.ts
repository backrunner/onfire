import { describe, expect, it } from "vitest";
import { buildDeliveryPlan } from "./delivery-plan";

describe("notification delivery planning", () => {
  it("deduplicates an endpoint matched by overlapping product rules", () => {
    const plan = buildDeliveryPlan(
      [
        { ruleId: "rule-a", userId: "agent-1", channelTypes: ["bark"] },
        { ruleId: "rule-b", userId: "agent-1", channelTypes: ["bark"] },
      ],
      [{ id: "endpoint-1", userId: "agent-1", channelType: "bark" }]
    );

    expect(plan.deliveries).toHaveLength(1);
    expect(plan.deliveries[0]?.endpoint.id).toBe("endpoint-1");
    expect(plan.missing).toEqual([]);
  });

  it("lets a mandatory requirement own the audit source when it overlaps a rule", () => {
    const plan = buildDeliveryPlan(
      [
        { ruleId: "rule-a", userId: "agent-1", channelTypes: ["bark"] },
        {
          requirementId: "requirement-a",
          userId: "agent-1",
          channelTypes: ["bark"],
        },
      ],
      [{ id: "endpoint-1", userId: "agent-1", channelType: "bark" }]
    );

    expect(plan.deliveries).toEqual([
      expect.objectContaining({
        requirementId: "requirement-a",
        endpoint: expect.objectContaining({ id: "endpoint-1" }),
      }),
    ]);
  });

  it("reports each selected method that the recipient has not configured", () => {
    const plan = buildDeliveryPlan(
      [
        {
          ruleId: "rule-a",
          userId: "agent-1",
          channelTypes: ["email", "slack", "wecom"],
        },
      ],
      [{ id: "email-1", userId: "agent-1", channelType: "email" }]
    );

    expect(plan.deliveries).toHaveLength(1);
    expect(plan.missing).toEqual([
      { ruleId: "rule-a", userId: "agent-1", channelType: "slack" },
      { ruleId: "rule-a", userId: "agent-1", channelType: "wecom" },
    ]);
  });

  it("keeps multiple personal endpoints of the same type", () => {
    const plan = buildDeliveryPlan(
      [{ ruleId: "rule-a", userId: "agent-1", channelTypes: ["email"] }],
      [
        { id: "work", userId: "agent-1", channelType: "email" },
        { id: "backup", userId: "agent-1", channelType: "email" },
      ]
    );

    expect(plan.deliveries.map((entry) => entry.endpoint.id)).toEqual([
      "work",
      "backup",
    ]);
  });
});
