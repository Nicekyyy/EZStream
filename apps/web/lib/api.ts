"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const isTauri = typeof window !== "undefined" && (
  window.location.origin.startsWith("tauri://") ||
  window.location.origin.startsWith("http://tauri.localhost") ||
  window.location.hostname === "tauri.localhost"
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (
  typeof window !== "undefined"
    ? (isTauri ? API_URL : window.location.origin.replace("localhost", "127.0.0.1"))
    : ""
);

function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ezstream_token");
}

export function setToken(token: string) {
  window.localStorage.setItem("ezstream_token", token);
}



export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (token) headers.set("authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

// API-served asset paths (e.g. /storage/tts/x.mp3) need the API origin —
// the web app runs on a different port in dev.
export function resolveAssetUrl(src: string) {
  return src.startsWith("/") ? `${API_URL}${src}` : src;
}

export { API_URL, APP_URL };
