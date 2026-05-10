"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { API_URL, api } from "../../../lib/api";
import type { UnifiedChatMessage } from "@ezstream/shared";

type Overlay = { id: string; name: string; token: string };
type EventLog = { id: string; eventType: string; payload: unknown; createdAt: string };
type ChatSource = {
  id: string;
  platform: "TIKTOK" | "YOUTUBE";
  target: string;
  label: string | null;
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
  isEnabled: boolean;
  errorMessage: string | null;
  lastConnectedAt: string | null;
  overlay?: { id: string; name: string; token: string };
};

const platformLabel: Record<string, string> = { TIKTOK: "TikTok", YOUTUBE: "YouTube" };
const statusColor: Record<string, string> = {
  DISCONNECTED: "bg-slate-600",
  CONNECTING: "bg-amber-500 animate-pulse",
  CONNECTED: "bg-emerald-500",
  ERROR: "bg-rose-500"
};

function PlatformIcon({ platform }: { platform: UnifiedChatMessage["platform"] }) {
  const isTikTok = platform === "tiktok";
  return (
    <span
      aria-label={isTikTok ? "TikTok" : "YouTube"}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white ${
        isTikTok ? "bg-slate-900 ring-1 ring-cyan-300" : "bg-red-600"
      }`}
      title={isTikTok ? "TikTok" : "YouTube"}
    >
      {isTikTok ? "♪" : "▶"}
    </span>
  );
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function chatMessageFromEvent(event: EventLog): UnifiedChatMessage | null {
  if (event.eventType !== "live.chat.message") return null;
  const payload = objectValue(event.payload);
  const message = stringValue(payload.message);
  if (!message) return null;
  const platform = payload.platform === "youtube" ? "youtube" : "tiktok";
  const username = stringValue(payload.username) ?? "unknown";
  const displayName = stringValue(payload.displayName) ?? username;

  return {
    id: stringValue(payload.id) ?? `event-${event.id}`,
    platform,
    username,
    displayName,
    message,
    avatarUrl: stringValue(payload.avatarUrl),
    badges: Array.isArray(payload.badges) ? payload.badges.filter((item): item is string => typeof item === "string") : [],
    timestamp: numberValue(payload.timestamp) ?? new Date(event.createdAt).getTime()
  };
}

function mergeChatMessages(current: UnifiedChatMessage[], incoming: UnifiedChatMessage[]) {
  const byId = new Map<string, UnifiedChatMessage>();
  for (const item of [...current, ...incoming]) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-100);
}

export default function ChatPage() {
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [chatMessages, setChatMessages] = useState<UnifiedChatMessage[]>([]);
  const [platform, setPlatform] = useState<"TIKTOK" | "YOUTUBE">("TIKTOK");
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [overlayId, setOverlayId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  async function load() {
    const [nextOverlays, nextSources, nextEvents] = await Promise.all([
      api<Overlay[]>("/overlays"),
      api<ChatSource[]>("/chat-sources"),
      api<EventLog[]>("/events")
    ]);
    setOverlays(nextOverlays);
    setSources(nextSources);
    setChatMessages((current) => mergeChatMessages(current, nextEvents.map(chatMessageFromEvent).filter((item): item is UnifiedChatMessage => Boolean(item))));
    if (!overlayId && nextOverlays[0]) setOverlayId(nextOverlays[0].id);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load data"));
  }, []);

  // Connect to Socket.IO for live chat preview
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      // Join all overlay rooms
      for (const overlay of overlays) {
        socket.emit("overlay.join", { token: overlay.token });
      }
    });

    socket.on("chat.message", (payload: UnifiedChatMessage) => {
      setChatMessages((prev) => mergeChatMessages(prev, [payload]));
    });

    socket.on("chat-source.status", (payload: { id: string; status: ChatSource["status"]; errorMessage: string | null }) => {
      setSources((prev) =>
        prev.map((s) => (s.id === payload.id ? { ...s, status: payload.status, errorMessage: payload.errorMessage } : s))
      );
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [overlays]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function createSource(event: FormEvent) {
    event.preventDefault();
    if (!target.trim() || !overlayId) return;
    setError("");
    setMessage("");
    try {
      await api("/chat-sources", {
        method: "POST",
        body: JSON.stringify({ platform, target: target.trim(), overlayId, label: label.trim() || undefined })
      });
      setTarget("");
      setLabel("");
      setMessage("สร้าง Chat Source สำเร็จ");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง Chat Source ไม่สำเร็จ");
    }
  }

  async function connectSource(id: string) {
    setError("");
    try {
      await api(`/chat-sources/${id}/connect`, { method: "POST" });
      setMessage("กำลังเชื่อมต่อ...");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ");
    }
  }

  async function disconnectSource(id: string) {
    setError("");
    try {
      await api(`/chat-sources/${id}/disconnect`, { method: "POST" });
      setMessage("ยกเลิกการเชื่อมต่อแล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ยกเลิกการเชื่อมต่อไม่สำเร็จ");
    }
  }

  async function deleteSource(id: string) {
    setError("");
    try {
      await api(`/chat-sources/${id}`, { method: "DELETE" });
      setMessage("ลบ Chat Source แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  async function sendMockChat() {
    const overlay = overlays[0];
    if (!overlay) return;
    const platforms: Array<"tiktok" | "youtube"> = ["tiktok", "youtube"];
    const names = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
    const msgs = ["สวัสดีครับ! 🎉", "Hello from chat!", "ดีจ้า 😊", "GG!", "ส่งกำลังใจ 💪", "สนุกมาก!", "Love this stream! ❤️"];
    try {
      await api("/mock-events/chat-message", {
        method: "POST",
        body: JSON.stringify({
          overlayToken: overlay.token,
          platform: platforms[Math.floor(Math.random() * platforms.length)],
          username: names[Math.floor(Math.random() * names.length)],
          message: msgs[Math.floor(Math.random() * msgs.length)]
        })
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่ง mock chat ไม่สำเร็จ");
    }
  }

  return (
    <DashboardShell title="Chat Overlay">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left: Create + Sources List */}
        <div className="space-y-4">
          <ResourceCard>
            <form onSubmit={createSource} className="grid gap-3">
              <h2 className="text-lg font-semibold">เพิ่ม Chat Source</h2>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="chat-platform">Platform</label>
                  <select
                    id="chat-platform"
                    className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-white"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as "TIKTOK" | "YOUTUBE")}
                  >
                    <option value="TIKTOK">TikTok</option>
                    <option value="YOUTUBE">YouTube</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="chat-overlay">Overlay</label>
                  <select
                    id="chat-overlay"
                    className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-white"
                    value={overlayId}
                    onChange={(e) => setOverlayId(e.target.value)}
                  >
                    {overlays.length ? overlays.map((o) => <option key={o.id} value={o.id}>{o.name}</option>) : <option value="">No overlay</option>}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="chat-target">
                  {platform === "TIKTOK" ? "TikTok Username (เช่น @username)" : "YouTube Channel (เช่น @channelhandle)"}
                </label>
                <input
                  id="chat-target"
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-white"
                  placeholder={platform === "TIKTOK" ? "@tiktokuser" : "@youtubechannel"}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="chat-label">ชื่อเรียก (ไม่บังคับ)</label>
                <input
                  id="chat-label"
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-white"
                  placeholder="เช่น Main TikTok"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>

              <button className="w-fit rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50" disabled={!target.trim() || !overlayId}>
                เพิ่ม Chat Source
              </button>

              {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
              {error ? <p className="text-sm text-rose-400">{error}</p> : null}
            </form>
          </ResourceCard>

          {/* Sources List */}
          <h2 className="text-lg font-semibold">Chat Sources ({sources.length})</h2>
          <div className="grid gap-3">
            {sources.length ? sources.map((source) => (
              <ResourceCard key={source.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor[source.status]}`} />
                      <span className="text-sm font-medium">{platformLabel[source.platform]}</span>
                      <span className="text-xs text-slate-400">{source.status}</span>
                    </div>
                    <p className="font-medium">{source.label || source.target}</p>
                    {source.label ? <p className="text-sm text-slate-400">{source.target}</p> : null}
                    <p className="text-xs text-slate-500">Overlay: {source.overlay?.name ?? "-"}</p>
                    {source.errorMessage ? <p className="text-sm text-rose-400">{source.errorMessage}</p> : null}
                    {source.lastConnectedAt ? <p className="text-xs text-slate-500">เชื่อมต่อล่าสุด: {new Date(source.lastConnectedAt).toLocaleString()}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {source.status === "CONNECTED" ? (
                      <button className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800" onClick={() => void disconnectSource(source.id)}>
                        Disconnect
                      </button>
                    ) : (
                      <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700" onClick={() => void connectSource(source.id)}>
                        Connect
                      </button>
                    )}
                    <button className="rounded-md border border-rose-800 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-950" onClick={() => void deleteSource(source.id)}>
                      ลบ
                    </button>
                  </div>
                </div>
              </ResourceCard>
            )) : (
              <ResourceCard><p className="text-sm text-slate-400">ยังไม่มี Chat Source</p></ResourceCard>
            )}
          </div>
        </div>

        {/* Right: Live Chat Preview */}
        <div className="space-y-3">
          <ResourceCard>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Live Chat Preview</h2>
                <button className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800" onClick={() => void sendMockChat()}>
                  + Mock Chat
                </button>
              </div>
              <div className="h-96 overflow-y-auto rounded-md border border-slate-800 bg-slate-950 p-3">
                {chatMessages.length === 0 ? (
                  <p className="text-sm text-slate-500">รอข้อความแชท...</p>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="mb-2 flex items-start gap-2">
                      {msg.avatarUrl ? (
                        <img src={msg.avatarUrl} alt="" referrerPolicy="no-referrer" className="mt-0.5 h-6 w-6 rounded-full" />
                      ) : (
                        <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${msg.platform === "tiktok" ? "bg-rose-600" : "bg-red-600"}`}>
                          {msg.platform === "tiktok" ? "T" : "Y"}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <PlatformIcon platform={msg.platform} />
                          <span className={`truncate text-xs font-semibold ${msg.platform === "tiktok" ? "text-rose-400" : "text-red-400"}`}>
                            {msg.displayName}
                          </span>
                        </div>
                        <p className="text-sm text-slate-200 break-words">{msg.message}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <p className="text-xs text-slate-500">{chatMessages.length} ข้อความ</p>
            </div>
          </ResourceCard>
        </div>
      </div>
    </DashboardShell>
  );
}
