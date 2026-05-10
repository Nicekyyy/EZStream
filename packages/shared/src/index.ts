export const APP_NAME = "EZStream";

export const PHASE = 2;

export const widgetTypes = [
  "ALERT_WIDGET",
  "TTS_WIDGET",
  "GOAL_WIDGET",
  "EVENT_LIST_WIDGET",
  "CHAT_WIDGET",
  "IMAGE_WIDGET",
  "SOUND_WIDGET",
  "TEXT_WIDGET"
] as const;

export type WidgetType = (typeof widgetTypes)[number];

export const conditionOperators = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "exists",
  "in"
] as const;

export type ConditionOperator = (typeof conditionOperators)[number];

export const ruleActionTypes = [
  "TRIGGER_WIDGET",
  "SHOW_ALERT",
  "PLAY_SOUND",
  "SPEAK_TTS",
  "UPDATE_GOAL",
  "APPEND_EVENT_LIST",
  "SHOW_IMAGE",
  "UPDATE_TEXT"
] as const;

export type RuleActionType = (typeof ruleActionTypes)[number];
