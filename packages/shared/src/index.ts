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

export const googleTtsVoices = [
  { name: "th-TH-Neural2-C", label: "Thai female - Neural2 C", languageCode: "th-TH", gender: "FEMALE" },
  { name: "th-TH-Standard-A", label: "Thai female - Standard A", languageCode: "th-TH", gender: "FEMALE" },
  { name: "en-US-Neural2-F", label: "English female - Neural2 F", languageCode: "en-US", gender: "FEMALE" },
  { name: "en-US-Neural2-J", label: "English male - Neural2 J", languageCode: "en-US", gender: "MALE" },
  { name: "en-US-Studio-O", label: "English female - Studio O", languageCode: "en-US", gender: "FEMALE" }
] as const;

export type GoogleTtsVoiceName = (typeof googleTtsVoices)[number]["name"];

export const defaultGoogleTtsVoiceName: GoogleTtsVoiceName = "th-TH-Neural2-C";

export function isGoogleTtsVoiceName(value: unknown): value is GoogleTtsVoiceName {
  return typeof value === "string" && googleTtsVoices.some((voice) => voice.name === value);
}

export function resolveGoogleTtsVoiceName(value: unknown, fallback: string = defaultGoogleTtsVoiceName) {
  if (isGoogleTtsVoiceName(value)) return value;
  if (isGoogleTtsVoiceName(fallback)) return fallback;
  return defaultGoogleTtsVoiceName;
}

export function googleTtsVoiceLanguageCode(voiceName: string) {
  return googleTtsVoices.find((voice) => voice.name === voiceName)?.languageCode ?? "th-TH";
}
