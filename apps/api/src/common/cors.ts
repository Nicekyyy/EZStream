function allowedOrigins(): string[] {
  return (process.env.API_CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  
  // Allow all Tauri/desktop app origins
  if (
    origin.startsWith("tauri://") ||
    origin.startsWith("http://tauri.localhost") ||
    origin === "tauri.localhost"
  ) {
    return true;
  }

  return allowedOrigins().includes(origin);
}
