export const AUDIO_ONLY_WIDGET_TYPES = ["TTS_WIDGET", "SOUND_WIDGET"] as const;

export function isAudioOnlyWidgetType(type: string): boolean {
  return (AUDIO_ONLY_WIDGET_TYPES as readonly string[]).includes(type);
}
