import { describe, expect, it } from "vitest";
import {
  isSafeAIBaseUrl,
  safeAIBaseUrl,
  AI_TASK_TYPES,
  isProviderAllowedForTask,
  modelKindForTask,
} from "@/lib/ai-config";
import { modelsForTask, providerSupportsTask } from "@/components/admin/ai/provider-presets";

describe("TypeSafe task boundaries", () => {
  it.each(AI_TASK_TYPES)("keeps %s consistent between runtime and UI", (task) => {
    expect(isProviderAllowedForTask(task, "typesafe")).toBe(task === "prescreening");
    expect(providerSupportsTask("typesafe", task)).toBe(task === "prescreening");
    expect(modelsForTask("typesafe", task).length > 0).toBe(task === "prescreening");
  });
  it("requires decision capabilities only for TypeSafe screening", () => {
    expect(modelKindForTask("prescreening", "typesafe")).toBe("decision");
    expect(modelKindForTask("prescreening", "openai")).toBe("text");
  });
});

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
