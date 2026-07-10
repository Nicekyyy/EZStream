import { BadRequestException } from "@nestjs/common";
import { conditionOperators, ruleActionTypes, type ConditionOperator, type RuleAction, type RuleActionType } from "@ezstream/shared";
import type { ConditionNode } from "./rule-evaluator.js";

const MAX_CONDITION_DEPTH = 8;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function validateEventTypes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new BadRequestException("eventTypes must be a non-empty array of strings");
  }
  return value;
}

export function validateConditionTree(node: unknown, depth = 0): ConditionNode {
  if (depth > MAX_CONDITION_DEPTH) throw new BadRequestException("Condition tree is too deeply nested");
  if (!node || typeof node !== "object") throw new BadRequestException("Invalid condition node");
  const value = node as Record<string, unknown>;

  if ("field" in value) {
    if (typeof value.field !== "string" || !value.field.trim()) {
      throw new BadRequestException("Condition field must be a non-empty string");
    }
    if (!conditionOperators.includes(value.operator as ConditionOperator)) {
      throw new BadRequestException(`Unknown operator: ${String(value.operator)}`);
    }
    return { field: value.field, operator: value.operator as ConditionOperator, value: value.value };
  }
  if (Array.isArray(value.all)) {
    return { all: value.all.map((child) => validateConditionTree(child, depth + 1)) };
  }
  if (Array.isArray(value.any)) {
    return { any: value.any.map((child) => validateConditionTree(child, depth + 1)) };
  }
  throw new BadRequestException("Condition node must have field/operator, or an all[]/any[] group");
}

export function validateActions(actions: unknown, depth = 0): RuleAction[] {
  if (!Array.isArray(actions)) throw new BadRequestException("actions must be an array");
  return actions.map((action) => validateAction(action, depth));
}

function validateAction(action: unknown, depth: number): RuleAction {
  if (!action || typeof action !== "object") throw new BadRequestException("Invalid action");
  const value = action as Record<string, unknown>;
  if (!ruleActionTypes.includes(value.type as RuleActionType)) {
    throw new BadRequestException(`Unknown action type: ${String(value.type)}`);
  }
  const type = value.type as RuleActionType;

  if (type === "RANDOM") {
    if (depth > 0) throw new BadRequestException("RANDOM action groups cannot be nested");
    const children = validateActions(value.actions, depth + 1);
    return {
      type,
      pick: typeof value.pick === "number" && value.pick > 0 ? value.pick : 1,
      actions: children
    };
  }

  return {
    type,
    widgetId: typeof value.widgetId === "string" ? value.widgetId : undefined,
    mediaAssetId: typeof value.mediaAssetId === "string" ? value.mediaAssetId : undefined,
    textTemplate: typeof value.textTemplate === "string" ? value.textTemplate : undefined,
    durationMs: typeof value.durationMs === "number" ? value.durationMs : undefined,
    amount: typeof value.amount === "number" || typeof value.amount === "string" ? value.amount : undefined
  };
}

export function validateActiveTime(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !timePattern.test(value)) {
    throw new BadRequestException(`${label} must be in HH:mm format`);
  }
  return value;
}
