"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { API_URL, api, ensureSession, resolveAssetUrl } from "../../../lib/api";

type EventLog = {
  id: string;
  eventType: string;
  payload: unknown;
  status?: string;
  matchedRuleIds?: string[];
  createdAt: string;
};

type EventKind = "gift" | "follow" | "like" | "share" | "subscribe" | "join";

const EVENT_META: Record<string, { kind: EventKind; icon: string; label: string }> = {
  "live.gift.received": { kind: "gift", icon: "🎁", label: "ของขวัญ" },
  "live.follow.received": { kind: "follow", icon: "➕", label: "ติดตาม" },
  "live.like.received": { kind: "like", icon: "❤️", label: "ไลก์" },
  "live.share.received": { kind: "share", icon: "🔁", label: "แชร์" },
  "live.subscribe.received": { kind: "subscribe", icon: "⭐", label: "ซับสไครบ์" },
  "live.viewer.joined": { kind: "join", icon: "👋", label: "เข้าห้อง" }
};

const FILTERS: Array<{ value: "all" | EventKind; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "gift", label: "ของขวัญ" },
  { value: "follow", label: "ติดตาม" },
  { value: "like", label: "ไลก์" },
  { value: "share", label: "แชร์" },
  { value: "subscribe", label: "ซับสไครบ์" },
  { value: "join", label: "เข้าห้อง" }
];

const TEST_BUTTONS: Array<{ path: string; label: string; icon: string }> = [
  { path: "/mock-events/gift", label: "ของขวัญ", icon: "🎁" },
  { path: "/mock-events/follow", label: "ติดตาม", icon: "➕" },
  { path: "/mock-events/like", label: "ไลก์", icon: "❤️" },
  { path: "/mock-events/share", label: "แชร์", icon: "🔁" },
  { path: "/mock-events/subscribe", label: "ซับสไครบ์", icon: "⭐" },
  { path: "/mock-events/join", label: "เข้าห้อง", icon: "👋" }
];

const MAX_ROWS = 200;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.round(diff / 1000));
  if (sec < 60) return `${sec} วินาทีที่แล้ว`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  return new Date(iso).toLocaleString();
}

function eventDetail(event: EventLog): string | null {
  const p = objectValue(event.payload);
  switch (event.eventType) {
    case "live.gift.received": {
      const gift = stringValue(p.giftName) ?? "ของขวัญ";
      const count = numberValue(p.repeatCount) ?? 1;
      const coins = numberValue(p.coins);
      return `${gift}${count > 1 ? ` ×${count}` : ""}${coins ? ` · 💎 ${coins}` : ""}`;
    }
    case "live.like.received": {
      const likes = numberValue(p.likeCount) ?? 1;
      return `+${likes} ไลก์`;
    }
    default:
      return null;
  }
}

function isNonChatEvent(event: EventLog) {
  return event.eventType !== "live.chat.message" && Boolean(EVENT_META[event.eventType]);
}

function mergeEvents(current: EventLog[], incoming: EventLog[]) {
  const byId = new Map<string, EventLog>();
  for (const item of [...incoming, ...current]) byId.set(item.id, item);
  return [...byId.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_ROWS);
}

function EventRow({ event }: { event: EventLog }) {
  const [expanded, setExpanded] = useState(false);
  const meta = EVENT_META[event.eventType];
  const p = objectValue(event.payload);
  const displayName = stringValue(p.displayName) ?? stringValue(p.username) ?? "ไม่ทราบชื่อ";
  const username = stringValue(p.username);
  const avatarUrl = stringValue(p.avatarUrl);
  const detail = eventDetail(event);
  const matched = (event.matchedRuleIds?.length ?? 0) > 0;

  return (
    <ResourceCard className="hover:translate-x-0 hover:translate-y-0 hover:shadow-brutal">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none border-2 border-border-base bg-surface-dark text-xl">
          {meta?.icon ?? "•"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">{meta?.label ?? event.eventType}</span>
            {matched ? (
              <span className="rounded-none border border-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                ตรงกับกฎ {event.matchedRuleIds!.length}
              </span>
            ) : null}
            <span className="ml-auto text-xs text-ink-subtle">{relativeTime(event.createdAt)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveAssetUrl(avatarUrl)} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
            ) : null}
            <p className="truncate font-medium text-ink-base">
              {displayName}
              {username && username !== displayName ? <span className="ml-1 text-sm text-ink-subtle">@{username}</span> : null}
            </p>
          </div>
          {detail ? <p className="mt-0.5 text-sm text-ink-subtle">{detail}</p> : null}
          <button
            type="button"
            className="mt-2 text-xs text-ink-subtle underline-offset-2 hover:text-white hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "ซ่อนข้อมูลดิบ" : "ดูข้อมูลดิบ (payload)"}
          </button>
          {expanded ? (
            <pre className="mt-2 max-h-64 overflow-auto rounded-none border-2 border-border-base bg-surface-dark p-3 text-xs text-ink-subtle">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </ResourceCard>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [filter, setFilter] = useState<"all" | EventKind>("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    void api<EventLog[]>("/events")
      .then((rows) => setEvents(mergeEvents([], rows.filter(isNonChatEvent))))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let socket: Socket | null = null;
    let closed = false;
    void ensureSession().then((token) => {
      if (closed) return;
      socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL, {
        transports: ["websocket"],
        auth: { token }
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket!.emit("creator.join");
      });

      socket.on("event.logged", (payload: EventLog) => {
        if (!isNonChatEvent(payload)) return;
        setEvents((prev) => mergeEvents(prev, [payload]));
      });
    });

    return () => {
      closed = true;
      socket?.close();
      socketRef.current = null;
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((e) => EVENT_META[e.eventType]?.kind === filter);
  }, [events, filter]);

  async function sendTest(path: string) {
    setError("");
    setSending(path);
    try {
      await api(path, { method: "POST", body: JSON.stringify({}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งอีเวนต์ทดสอบไม่สำเร็จ");
    } finally {
      setSending(null);
    }
  }

  return (
    <DashboardShell title="อีเวนต์">
      <div className="space-y-4">
        <ResourceCard>
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">ส่งอีเวนต์ทดสอบ</h2>
              <p className="text-sm text-ink-subtle">อีเวนต์ทดสอบจะวิ่งผ่านกฎการทำงานจริงและปรากฏในรายการด้านล่างแบบเรียลไทม์</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {TEST_BUTTONS.map((btn) => (
                <button
                  key={btn.path}
                  type="button"
                  onClick={() => void sendTest(btn.path)}
                  disabled={sending === btn.path}
                  className="flex items-center gap-1.5 rounded-none border-2 border-border-base bg-surface-dark px-3 py-1.5 text-sm text-ink-base transition-all hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <span>{btn.icon}</span>
                  {sending === btn.path ? "กำลังส่ง..." : btn.label}
                </button>
              ))}
            </div>
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          </div>
        </ResourceCard>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`rounded-none border-2 px-3 py-1.5 text-xs font-semibold transition-all ${
                  active ? "border-primary bg-surface-card text-primary shadow-brutal-sm" : "border-transparent text-ink-subtle hover:border-border-base hover:text-white"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <ResourceCard><p className="text-sm text-ink-subtle">กำลังโหลดข้อมูล...</p></ResourceCard>
        ) : filtered.length ? (
          <div className="grid gap-3">
            {filtered.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <ResourceCard>
            <p className="text-sm text-ink-subtle">
              {events.length ? "ไม่มีอีเวนต์ในหมวดนี้" : "ยังไม่มีอีเวนต์ — ลองส่งอีเวนต์ทดสอบด้านบน หรือเชื่อมต่อแชทสดเพื่อรับอีเวนต์จริง"}
            </p>
          </ResourceCard>
        )}
      </div>
    </DashboardShell>
  );
}
