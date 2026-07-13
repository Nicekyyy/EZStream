export const secretSettingsKeys = ["googleTtsServiceAccountJson", "tiktokSignApiKey"];

export function redactCreatorSettings<T extends { settings?: unknown }>(creator: T): T {
  if (!creator || typeof creator.settings !== "object" || !creator.settings || Array.isArray(creator.settings)) {
    return creator;
  }
  const settings = { ...(creator.settings as Record<string, unknown>) };
  for (const key of secretSettingsKeys) {
    if (settings[key]) settings[key] = true;
  }
  return { ...creator, settings };
}
