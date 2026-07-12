export function configNumber(config: Record<string, unknown>, key: string, fallback: number) {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function configString(config: Record<string, unknown>, key: string, fallback: string) {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

export function configBool(config: Record<string, unknown>, key: string, fallback: boolean) {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}
