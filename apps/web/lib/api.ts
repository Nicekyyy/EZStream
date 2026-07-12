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

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ezstream_token");
}

export function setToken(token: string) {
  window.localStorage.setItem("ezstream_token", token);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("ezstream_token");
}

const DEFAULT_ACCOUNT = {
  email: "demo@example.com",
  password: "password123"
};

// กัน login/register ซ้ำเมื่อหลายคำขอยิงพร้อมกัน (เช่น Promise.all บน dashboard)
let sessionPromise: Promise<string> | null = null;

async function requestToken(path: string): Promise<string> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(DEFAULT_ACCOUNT)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const data = (await response.json()) as { accessToken: string };
  return data.accessToken;
}

export function ensureSession(): Promise<string> {
  const existing = getToken();
  if (existing) return Promise.resolve(existing);

  if (!sessionPromise) {
    sessionPromise = (async () => {
      let token: string;
      try {
        // บัญชี default มีอยู่แล้ว (จาก seed) — login ปกติ
        token = await requestToken("/auth/login");
      } catch {
        // database ใหม่ยังไม่ seed — สร้างบัญชี default ให้อัตโนมัติ
        token = await requestToken("/auth/register");
      }
      setToken(token);
      return token;
    })().finally(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  async function send(token: string): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type") && init.body && !(init.body instanceof FormData)) {
      headers.set("content-type", "application/json");
    }
    headers.set("authorization", `Bearer ${token}`);
    return fetch(`${API_URL}${path}`, { ...init, headers });
  }

  let token = await ensureSession();
  let response = await send(token);

  // token หมดอายุ/ไม่ถูกต้อง — ล้างแล้ว login ใหม่ retry 1 ครั้ง
  if (response.status === 401) {
    clearToken();
    token = await ensureSession();
    response = await send(token);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `คำขอไม่สำเร็จ (${response.status})`);
  }
  return (await response.json()) as T;
}

// API-served asset paths (e.g. /storage/tts/x.mp3) need the API origin —
// the web app runs on a different port in dev.
export function resolveAssetUrl(src: string) {
  return src.startsWith("/") ? `${API_URL}${src}` : src;
}

export { API_URL, APP_URL };
