import { getPathValue, type ConditionOperator } from "@ezstream/shared";

export type ConditionLeaf = { field: string; operator: ConditionOperator; value: unknown };
export type ConditionGroup = { all: ConditionNode[] } | { any: ConditionNode[] };
export type ConditionNode = ConditionLeaf | ConditionGroup;

export type ConditionTrace = {
  field: string;
  operator: ConditionOperator;
  expected: unknown;
  actual: unknown;
  passed: boolean;
};

const MAX_DEPTH = 8;

function isLeaf(node: ConditionNode): node is ConditionLeaf {
  return typeof (node as ConditionLeaf).field === "string";
}

function normalizeForCompare(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function toNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function compare(operator: ConditionOperator, actual: unknown, expected: unknown): boolean {
  switch (operator) {
    case "equals":
      return normalizeForCompare(actual) === normalizeForCompare(expected);
    case "notEquals":
      return normalizeForCompare(actual) !== normalizeForCompare(expected);
    case "contains":
      return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "notContains":
      return !String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "greaterThan":
      return toNumber(actual) > toNumber(expected);
    case "greaterThanOrEqual":
      return toNumber(actual) >= toNumber(expected);
    case "lessThan":
      return toNumber(actual) < toNumber(expected);
    case "lessThanOrEqual":
      return toNumber(actual) <= toNumber(expected);
    case "exists":
      return actual !== undefined && actual !== null;
    case "in": {
      const list = Array.isArray(expected)
        ? expected
        : String(expected ?? "").split(",").map((item) => item.trim()).filter(Boolean);
      return list.some((item) => normalizeForCompare(item) === normalizeForCompare(actual));
    }
    default:
      return false;
  }
}

export function evaluateConditions(node: ConditionNode, payload: Record<string, unknown>, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (isLeaf(node)) {
    return compare(node.operator, getPathValue(payload, node.field), node.value);
  }
  if ("all" in node) {
    return node.all.every((child) => evaluateConditions(child, payload, depth + 1));
  }
  return node.any.some((child) => evaluateConditions(child, payload, depth + 1));
}

export function evaluateConditionsWithTrace(
  node: ConditionNode,
  payload: Record<string, unknown>,
  depth = 0
): { passed: boolean; trace: ConditionTrace[] } {
  if (depth > MAX_DEPTH) return { passed: false, trace: [] };
  if (isLeaf(node)) {
    const actual = getPathValue(payload, node.field);
    const passed = compare(node.operator, actual, node.value);
    return { passed, trace: [{ field: node.field, operator: node.operator, expected: node.value, actual, passed }] };
  }
  const children = "all" in node ? node.all : node.any;
  const results = children.map((child) => evaluateConditionsWithTrace(child, payload, depth + 1));
  const trace = results.flatMap((result) => result.trace);
  const passed = "all" in node ? results.every((result) => result.passed) : results.some((result) => result.passed);
  return { passed, trace };
}

export function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  const n = Math.max(0, Math.min(count, pool.length));
  for (let i = 0; i < n; i++) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}
