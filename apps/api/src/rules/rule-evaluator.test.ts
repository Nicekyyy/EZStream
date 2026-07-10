import { describe, expect, it } from "vitest";
import { evaluateConditions, evaluateConditionsWithTrace, pickRandom, type ConditionNode } from "./rule-evaluator.js";

describe("evaluateConditions", () => {
  it("matches an empty all-group unconditionally", () => {
    expect(evaluateConditions({ all: [] }, { anything: 1 })).toBe(true);
  });

  it("evaluates equals case-insensitively", () => {
    const node: ConditionNode = { field: "giftName", operator: "equals", value: "Rose" };
    expect(evaluateConditions(node, { giftName: "rose" })).toBe(true);
    expect(evaluateConditions(node, { giftName: "Lion" })).toBe(false);
  });

  it("evaluates notEquals", () => {
    const node: ConditionNode = { field: "giftName", operator: "notEquals", value: "Rose" };
    expect(evaluateConditions(node, { giftName: "Lion" })).toBe(true);
    expect(evaluateConditions(node, { giftName: "Rose" })).toBe(false);
  });

  it("evaluates contains and notContains case-insensitively", () => {
    const contains: ConditionNode = { field: "message", operator: "contains", value: "hello" };
    expect(evaluateConditions(contains, { message: "well HELLO there" })).toBe(true);
    expect(evaluateConditions(contains, { message: "goodbye" })).toBe(false);

    const notContains: ConditionNode = { field: "message", operator: "notContains", value: "hello" };
    expect(evaluateConditions(notContains, { message: "goodbye" })).toBe(true);
  });

  it("evaluates numeric comparisons, coercing numeric strings", () => {
    expect(evaluateConditions({ field: "coins", operator: "greaterThan", value: 50 }, { coins: 100 })).toBe(true);
    expect(evaluateConditions({ field: "coins", operator: "greaterThan", value: 50 }, { coins: "40" })).toBe(false);
    expect(evaluateConditions({ field: "coins", operator: "greaterThanOrEqual", value: 100 }, { coins: 100 })).toBe(true);
    expect(evaluateConditions({ field: "coins", operator: "lessThan", value: 50 }, { coins: 10 })).toBe(true);
    expect(evaluateConditions({ field: "coins", operator: "lessThanOrEqual", value: 10 }, { coins: 10 })).toBe(true);
  });

  it("evaluates exists", () => {
    expect(evaluateConditions({ field: "username", operator: "exists", value: null }, { username: "a" })).toBe(true);
    expect(evaluateConditions({ field: "username", operator: "exists", value: null }, {})).toBe(false);
  });

  it("evaluates in against a comma string or an array", () => {
    const csv: ConditionNode = { field: "giftName", operator: "in", value: "Rose, Lion, Universe" };
    expect(evaluateConditions(csv, { giftName: "lion" })).toBe(true);
    expect(evaluateConditions(csv, { giftName: "Panda" })).toBe(false);

    const arr: ConditionNode = { field: "giftName", operator: "in", value: ["Rose", "Lion"] };
    expect(evaluateConditions(arr, { giftName: "Rose" })).toBe(true);
  });

  it("resolves dot-path fields", () => {
    const node: ConditionNode = { field: "user.badges.0", operator: "equals", value: "vip" };
    expect(evaluateConditions(node, { user: { badges: ["vip"] } })).toBe(true);
  });

  it("combines nested all/any groups", () => {
    const node: ConditionNode = {
      all: [
        { field: "giftName", operator: "equals", value: "Rose" },
        {
          any: [
            { field: "repeatCount", operator: "greaterThanOrEqual", value: 5 },
            { field: "coins", operator: "greaterThanOrEqual", value: 100 }
          ]
        }
      ]
    };
    expect(evaluateConditions(node, { giftName: "Rose", repeatCount: 1, coins: 100 })).toBe(true);
    expect(evaluateConditions(node, { giftName: "Rose", repeatCount: 1, coins: 10 })).toBe(false);
    expect(evaluateConditions(node, { giftName: "Lion", repeatCount: 10, coins: 100 })).toBe(false);
  });

  it("stops recursing past the max depth and treats it as non-matching", () => {
    let node: ConditionNode = { field: "x", operator: "equals", value: 1 };
    for (let i = 0; i < 12; i++) node = { all: [node] };
    expect(evaluateConditions(node, { x: 1 })).toBe(false);
  });
});

describe("evaluateConditionsWithTrace", () => {
  it("returns a trace entry per leaf with pass/fail", () => {
    const node: ConditionNode = {
      all: [
        { field: "giftName", operator: "equals", value: "Rose" },
        { field: "coins", operator: "greaterThanOrEqual", value: 100 }
      ]
    };
    const { passed, trace } = evaluateConditionsWithTrace(node, { giftName: "Rose", coins: 10 });
    expect(passed).toBe(false);
    expect(trace).toHaveLength(2);
    expect(trace[0]).toMatchObject({ field: "giftName", passed: true });
    expect(trace[1]).toMatchObject({ field: "coins", passed: false, actual: 10 });
  });
});

describe("pickRandom", () => {
  it("returns at most `count` distinct items from the pool", () => {
    const items = [1, 2, 3, 4, 5];
    const picked = pickRandom(items, 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    for (const item of picked) expect(items).toContain(item);
  });

  it("clamps count to the pool size and to zero", () => {
    expect(pickRandom([1, 2], 10)).toHaveLength(2);
    expect(pickRandom([1, 2], -1)).toHaveLength(0);
    expect(pickRandom([], 3)).toHaveLength(0);
  });
});
