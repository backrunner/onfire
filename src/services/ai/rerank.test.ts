import { describe, expect, it } from "vitest";
import { applyRerankOrder } from "./rerank";

describe("AI reranking", () => {
  it("applies provider order and ignores invalid or duplicate indices", () => {
    const rows = ["first", "second", "third"];
    expect(applyRerankOrder(rows, {
      results: [
        { index: 2, relevanceScore: 0.9 },
        { index: 2, relevanceScore: 0.8 },
        { index: 8, relevanceScore: 0.7 },
        { index: 0, relevanceScore: 0.6 },
      ],
    }, 2)).toEqual(["third", "first"]);
  });

  it("keeps vector order when reranking is unavailable", () => {
    expect(applyRerankOrder(["first", "second"], null, 1)).toEqual(["first"]);
  });

  it("fills a partial provider response with the remaining fallback order", () => {
    expect(applyRerankOrder(["first", "second", "third"], {
      results: [{ index: 2, relevanceScore: 0.9 }],
    }, 3)).toEqual(["third", "first", "second"]);
  });
});
