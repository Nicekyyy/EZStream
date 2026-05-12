export declare const APP_NAME = "EZStream";
export declare const PHASE = 2;
export declare const widgetTypes: readonly ["ALERT_WIDGET", "TTS_WIDGET", "GOAL_WIDGET", "EVENT_LIST_WIDGET", "CHAT_WIDGET", "IMAGE_WIDGET", "SOUND_WIDGET", "TEXT_WIDGET"];
export type WidgetType = (typeof widgetTypes)[number];
export declare const conditionOperators: readonly ["equals", "notEquals", "contains", "notContains", "greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual", "exists", "in"];
export type ConditionOperator = (typeof conditionOperators)[number];
export declare const ruleActionTypes: readonly ["TRIGGER_WIDGET", "SHOW_ALERT", "PLAY_SOUND", "SPEAK_TTS", "UPDATE_GOAL", "APPEND_EVENT_LIST", "SHOW_IMAGE", "UPDATE_TEXT"];
export type RuleActionType = (typeof ruleActionTypes)[number];
export declare const googleTtsVoices: readonly [{
    readonly name: "th-TH-Neural2-C";
    readonly label: "Thai female - Neural2 C";
    readonly languageCode: "th-TH";
    readonly gender: "FEMALE";
}, {
    readonly name: "th-TH-Standard-A";
    readonly label: "Thai female - Standard A";
    readonly languageCode: "th-TH";
    readonly gender: "FEMALE";
}, {
    readonly name: "en-US-Neural2-F";
    readonly label: "English female - Neural2 F";
    readonly languageCode: "en-US";
    readonly gender: "FEMALE";
}, {
    readonly name: "en-US-Neural2-J";
    readonly label: "English male - Neural2 J";
    readonly languageCode: "en-US";
    readonly gender: "MALE";
}, {
    readonly name: "en-US-Studio-O";
    readonly label: "English female - Studio O";
    readonly languageCode: "en-US";
    readonly gender: "FEMALE";
}];
export type GoogleTtsVoiceName = (typeof googleTtsVoices)[number]["name"];
export declare const defaultGoogleTtsVoiceName: GoogleTtsVoiceName;
export declare function isGoogleTtsVoiceName(value: unknown): value is GoogleTtsVoiceName;
export declare function resolveGoogleTtsVoiceName(value: unknown, fallback?: string): "th-TH-Neural2-C" | "th-TH-Standard-A" | "en-US-Neural2-F" | "en-US-Neural2-J" | "en-US-Studio-O";
export declare function googleTtsVoiceLanguageCode(voiceName: string): "th-TH" | "en-US";
export declare function sanitizeTtsText(value: string): string;
export declare const chatPlatforms: readonly ["TIKTOK", "YOUTUBE"];
export type ChatPlatformType = (typeof chatPlatforms)[number];
export type UnifiedChatMessage = {
    id: string;
    platform: "tiktok" | "youtube";
    username: string;
    displayName: string;
    message: string;
    avatarUrl?: string;
    badges?: string[];
    timestamp: number;
};
export declare const CHAT_COMMANDS_CHANNEL = "ezstream:chat-commands";
export declare const REALTIME_CHANNEL = "ezstream:realtime";
