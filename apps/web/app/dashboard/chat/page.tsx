"use client";

import { FormEvent, useEffect, useRef, useState, useMemo } from "react";
import { io, type Socket } from "socket.io-client";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { renderChatMessageText, WidgetRenderer, type OverlayWidget } from "../../../components/widget-renderer";
import { TiktokIcon, YoutubeIcon, TwitchIcon } from "../../../components/icons";
import { API_URL, api } from "../../../lib/api";
import type { UnifiedChatMessage } from "@ezstream/shared";

type Overlay = { id: string; name: string; token: string };
type EventLog = { id: string; eventType: string; payload: unknown; createdAt: string };
type ChatSource = {
  id: string;
  platform: "TIKTOK" | "YOUTUBE" | "TWITCH";
  target: string;
  label: string | null;
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
  isEnabled: boolean;
  errorMessage: string | null;
  lastConnectedAt: string | null;
  overlay?: { id: string; name: string; token: string };
};

const platformLabel: Record<string, string> = { TIKTOK: "TikTok", YOUTUBE: "YouTube", TWITCH: "Twitch" };
const statusColor: Record<string, string> = {
  DISCONNECTED: "bg-slate-600",
  CONNECTING: "bg-amber-500 animate-pulse",
  CONNECTED: "bg-emerald-500",
  ERROR: "bg-rose-500"
};
const statusLabel: Record<string, string> = {
  DISCONNECTED: "ไม่ได้เชื่อมต่อ",
  CONNECTING: "กำลังเชื่อมต่อ",
  CONNECTED: "เชื่อมต่อแล้ว",
  ERROR: "ผิดพลาด"
};

function PlatformIcon({ platform }: { platform: UnifiedChatMessage["platform"] }) {
  if (platform === "tiktok") return <TiktokIcon className="h-4 w-4 shrink-0 drop-shadow-sm" />;
  if (platform === "twitch") return <TwitchIcon className="h-4 w-4 shrink-0 drop-shadow-sm" />;
  return <YoutubeIcon className="h-4 w-4 shrink-0 drop-shadow-sm" />;
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
  const p = stringValue(payload.platform);
  const platform = p === "youtube" ? "youtube" : p === "twitch" ? "twitch" : "tiktok";
  const username = stringValue(payload.username) ?? "unknown";
  const displayName = stringValue(payload.displayName) ?? username;

  return {
    id: stringValue(payload.id) ?? `event-${event.id}`,
    platform,
    username,
    displayName,
    message,
    avatarUrl: stringValue(payload.avatarUrl),
    badges: Array.isArray(payload.badges) ? payload.badges.map((b: any) => ({ label: typeof b === "string" ? b : String(b.label || ""), url: b.url ? String(b.url) : undefined })) : [],
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
  const [platform, setPlatform] = useState<"TIKTOK" | "YOUTUBE" | "TWITCH">("TIKTOK");
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [overlayId, setOverlayId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [isPageLoading, setIsPageLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);

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
    void load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setIsPageLoading(false));
  }, []);

  const overlayTokens = useMemo(() => overlays.map(o => o.token).sort().join(","), [overlays]);

  // Connect to Socket.IO for live chat preview
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      // Join all overlay rooms
      const tokens = overlayTokens.split(",").filter(Boolean);
      for (const token of tokens) {
        socket.emit("overlay.join", { token });
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
  }, [overlayTokens]);

  const mockWidget: OverlayWidget = {
    id: "preview",
    name: "Chat Preview",
    type: "CHAT_WIDGET",
    positionX: 0,
    positionY: 0,
    width: "100%" as unknown as number,
    height: "100%" as unknown as number,
    zIndex: 1,
    visibility: true,
    config: {
      showAvatar: true,
      showBadges: true,
      badgesPosition: "before",
      theme: "modern",
      align: "left",
      direction: "down",
      showEmptyState: true,
      order: "newest-bottom"
    }
  };

  async function createSource(event: FormEvent) {
    event.preventDefault();
    if (!target.trim() || !overlayId || isSubmitting) return;
    setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
    }
  }

  async function connectSource(id: string) {
    setError("");
    setActionLoading(prev => ({ ...prev, [id]: "CONNECTING" }));
    try {
      setSources(prev => prev.map(s => s.id === id ? { ...s, status: "CONNECTING", errorMessage: null } : s));
      setMessage("กำลังเชื่อมต่อ...");
      await api(`/chat-sources/${id}/connect`, { method: "POST" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ");
      await load();
    } finally {
      setActionLoading(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
  }

  async function disconnectSource(id: string) {
    setError("");
    setActionLoading(prev => ({ ...prev, [id]: "DISCONNECTING" }));
    try {
      setMessage("กำลังยกเลิกการเชื่อมต่อ...");
      await api(`/chat-sources/${id}/disconnect`, { method: "POST" });
      setSources(prev => prev.map(s => s.id === id ? { ...s, status: "DISCONNECTED", errorMessage: null } : s));
      setMessage("ยกเลิกการเชื่อมต่อแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ยกเลิกการเชื่อมต่อไม่สำเร็จ");
      await load();
    } finally {
      setActionLoading(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
  }

  async function deleteSource(id: string) {
    setError("");
    setActionLoading(prev => ({ ...prev, [id]: "DELETING" }));
    try {
      await api(`/chat-sources/${id}`, { method: "DELETE" });
      setMessage("ลบ Chat Source แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setActionLoading(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
  }

  async function sendMockChat() {
    const overlay = overlays[0];
    if (!overlay) return;
    const platforms: Array<"tiktok" | "youtube" | "twitch"> = ["tiktok", "youtube", "twitch"];
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
    <DashboardShell title="โอเวอร์เลย์แชท">
      {isPageLoading ? (
        <div className="flex min-h-[50vh] items-center justify-center rounded-xl border border-slate-800/50 bg-slate-900/20 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <svg className="h-8 w-8 animate-spin text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-sm font-medium text-slate-400">กำลังโหลดข้อมูล...</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left: Create + Sources List */}
        <div className="space-y-4">
          <ResourceCard>
            <form onSubmit={createSource} className="grid gap-3">
              <h2 className="text-lg font-semibold">เพิ่ม Chat Source</h2>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="chat-platform">แพลตฟอร์ม (Platform)</label>
                  <select
                    id="chat-platform"
                    className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-white"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as "TIKTOK" | "YOUTUBE" | "TWITCH")}
                  >
                    <option value="TIKTOK">TikTok</option>
                    <option value="YOUTUBE">YouTube</option>
                    <option value="TWITCH">Twitch</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="chat-overlay">โอเวอร์เลย์</label>
                  <select
                    id="chat-overlay"
                    className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-white"
                    value={overlayId}
                    onChange={(e) => setOverlayId(e.target.value)}
                  >
                    {overlays.length ? overlays.map((o) => <option key={o.id} value={o.id}>{o.name}</option>) : <option value="">ไม่มี Overlay</option>}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="chat-target">
                  {platform === "TIKTOK" && "ชื่อผู้ใช้ TikTok (เช่น @username)"}
                  {platform === "YOUTUBE" && "YouTube Channel (ชื่อช่อง, @handle, URL หรือ Video ID)"}
                  {platform === "TWITCH" && "Twitch Channel (ชื่อช่อง)"}
                </label>
                <input
                  id="chat-target"
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-white"
                  placeholder={
                    platform === "TIKTOK" ? "@tiktokuser" :
                    platform === "TWITCH" ? "เช่น zbingz" :
                    "เช่น WorkpointOfficial หรือ @channelhandle"
                  }
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

              <button className="w-fit rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2" disabled={!target.trim() || !overlayId || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    กำลังเพิ่ม...
                  </>
                ) : "เพิ่ม Chat Source"}
              </button>

              {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
              {error ? <p className="text-sm text-rose-400">{error}</p> : null}
            </form>
          </ResourceCard>

          {/* Sources List */}
          <h2 className="text-lg font-semibold">Chat Source ทั้งหมด ({sources.length})</h2>
          <div className="grid gap-3">
            {sources.length ? sources.map((source) => (
              <ResourceCard key={source.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor[source.status]}`} />
                      <span className="text-sm font-medium">{platformLabel[source.platform]}</span>
                      <span className="text-xs text-slate-400">{statusLabel[source.status] ?? source.status}</span>
                    </div>
                    <p className="font-medium">{source.label || source.target}</p>
                    {source.label ? <p className="text-sm text-slate-400">{source.target}</p> : null}
                    <p className="text-xs text-slate-500">โอเวอร์เลย์: {source.overlay?.name ?? "-"}</p>
                    {source.errorMessage ? <p className="text-sm text-rose-400">{source.errorMessage}</p> : null}
                    {source.lastConnectedAt ? <p className="text-xs text-slate-500">เชื่อมต่อล่าสุด: {new Date(source.lastConnectedAt).toLocaleString()}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {source.status === "CONNECTED" ? (
                      <button 
                        className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed" 
                        onClick={() => void disconnectSource(source.id)}
                        disabled={!!actionLoading[source.id]}
                      >
                        {actionLoading[source.id] === "DISCONNECTING" && (
                          <svg className="animate-spin h-3.5 w-3.5 text-slate-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        )}
                        {actionLoading[source.id] === "DISCONNECTING" ? "กำลังตัดการ..." : "ตัดการเชื่อมต่อ"}
                      </button>
                    ) : (
                      <button 
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-white ${source.status === "CONNECTING" || actionLoading[source.id] === "CONNECTING" ? "bg-amber-600 opacity-50 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"} disabled:opacity-50 disabled:cursor-not-allowed`}
                        onClick={() => void connectSource(source.id)}
                        disabled={source.status === "CONNECTING" || !!actionLoading[source.id]}
                      >
                        {(source.status === "CONNECTING" || actionLoading[source.id] === "CONNECTING") && (
                          <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        )}
                        {source.status === "CONNECTING" || actionLoading[source.id] === "CONNECTING" ? "กำลังเชื่อมต่อ..." : "เชื่อมต่อ"}
                      </button>
                    )}
                    <button 
                      className="flex items-center gap-1.5 rounded-md border border-rose-800 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-950 disabled:opacity-50 disabled:cursor-not-allowed" 
                      onClick={() => void deleteSource(source.id)}
                      disabled={!!actionLoading[source.id]}
                    >
                      {actionLoading[source.id] === "DELETING" && (
                        <svg className="animate-spin h-3.5 w-3.5 text-rose-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {actionLoading[source.id] === "DELETING" ? "กำลังลบ..." : "ลบ"}
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
                <h2 className="text-lg font-semibold">ตัวอย่างแชทสด</h2>
                <button className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800" onClick={() => void sendMockChat()}>
                  + แชทจำลอง
                </button>
              </div>
              <div className="relative h-96 overflow-hidden rounded-md border border-slate-800 bg-slate-950">
                <WidgetRenderer widget={mockWidget} chatMessages={chatMessages} />
              </div>
              <p className="text-xs text-slate-500">{chatMessages.length} ข้อความ</p>
            </div>
          </ResourceCard>
        </div>
        </div>
      )}
    </DashboardShell>
  );
}

