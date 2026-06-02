"use client";

import { Button } from "@ezstream/ui";
import type { UnifiedChatMessage } from "@ezstream/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { io, type Socket } from "socket.io-client";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { ResourceCard } from "../../../../components/resource-card";
import { WidgetRenderer, type OverlayWidget } from "../../../../components/widget-renderer";
import { Badge, Field, Input, Notice, Select } from "../../../../components/ui-kit";
import { API_URL, APP_URL, api } from "../../../../lib/api";
import { copyText } from "../../../../lib/clipboard";

type Overlay = { id: string; name: string; token: string };
type EventLog = { id: string; eventType: string; payload: unknown; createdAt: string };
type PreviewChatMessage = UnifiedChatMessage & { overlayId?: string; overlayToken?: string };
type Widget = {
  id: string;
  overlayId: string | null;
  name: string;
  type: string;
  isEnabled: boolean;
  visibility: boolean;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  config?: unknown;
  state?: { state: unknown };
  overlay?: Overlay;
};

type ChatSettingsDraft = {
  maxMessages: number;
  order: string;
  align: string;
  bubbleStyle: string;
  fontFamily: string;
  showAvatar: boolean;
  showName: boolean;
  showPlatformLogo: boolean;
  showEmptyState: boolean;
  animateMessages: boolean;
  compactMode: boolean;
  textShadow: boolean;
  backgroundColor: string;
  bubbleColor: string;
  textColor: string;
  tiktokNameColor: string;
  youtubeNameColor: string;
  backgroundOpacity: number;
  bubbleOpacity: number;
  borderOpacity: number;
  fontSize: number;
  nameFontSize: number;
  avatarSize: number;
  padding: number;
  gap: number;
  borderRadius: number;
  messagePaddingX: number;
  messagePaddingY: number;
};

function configObject(widget: Widget | undefined) {
  return widget?.config && typeof widget.config === "object" && !Array.isArray(widget.config)
    ? (widget.config as Record<string, unknown>)
    : {};
}

function configNumber(config: Record<string, unknown>, key: keyof ChatSettingsDraft, fallback: number) {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function configString(config: Record<string, unknown>, key: keyof ChatSettingsDraft, fallback: string) {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

function configBool(config: Record<string, unknown>, key: keyof ChatSettingsDraft, fallback: boolean) {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
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

function chatMessageFromEvent(event: EventLog): PreviewChatMessage | null {
  if (event.eventType !== "live.chat.message") return null;
  const payload = objectValue(event.payload);
  const message = stringValue(payload.message);
  if (!message) return null;
  const username = stringValue(payload.username) ?? "unknown";
  return {
    id: stringValue(payload.id) ?? `event-${event.id}`,
    platform: payload.platform === "youtube" ? "youtube" : "tiktok",
    username,
    displayName: stringValue(payload.displayName) ?? username,
    message,
    avatarUrl: stringValue(payload.avatarUrl),
    badges: Array.isArray(payload.badges) ? payload.badges.filter((item): item is string => typeof item === "string") : [],
    timestamp: numberValue(payload.timestamp) ?? new Date(event.createdAt).getTime(),
    overlayId: stringValue(payload.overlayId),
    overlayToken: stringValue(payload.overlayToken)
  };
}

function mergeChatMessages(current: PreviewChatMessage[], incoming: PreviewChatMessage[]) {
  const byId = new Map<string, PreviewChatMessage>();
  for (const item of [...current, ...incoming]) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-50);
}

function chatSettingsFromConfig(config: Record<string, unknown>): ChatSettingsDraft {
  return {
    maxMessages: configNumber(config, "maxMessages", 8),
    order: configString(config, "order", "newest-bottom"),
    align: configString(config, "align", "left"),
    bubbleStyle: configString(config, "bubbleStyle", "glass"),
    fontFamily: configString(config, "fontFamily", "system"),
    showAvatar: configBool(config, "showAvatar", true),
    showName: configBool(config, "showName", true),
    showPlatformLogo: configBool(config, "showPlatformLogo", true),
    showEmptyState: configBool(config, "showEmptyState", true),
    animateMessages: configBool(config, "animateMessages", true),
    compactMode: configBool(config, "compactMode", false),
    textShadow: configBool(config, "textShadow", true),
    backgroundColor: configString(config, "backgroundColor", "#000000"),
    bubbleColor: configString(config, "bubbleColor", "#000000"),
    textColor: configString(config, "textColor", "#ffffff"),
    tiktokNameColor: configString(config, "tiktokNameColor", "#f9a8d4"),
    youtubeNameColor: configString(config, "youtubeNameColor", "#fca5a5"),
    backgroundOpacity: configNumber(config, "backgroundOpacity", 0),
    bubbleOpacity: configNumber(config, "bubbleOpacity", 0.55),
    borderOpacity: configNumber(config, "borderOpacity", 0.1),
    fontSize: configNumber(config, "fontSize", 15),
    nameFontSize: configNumber(config, "nameFontSize", 13),
    avatarSize: configNumber(config, "avatarSize", 32),
    padding: configNumber(config, "padding", 12),
    gap: configNumber(config, "gap", 8),
    borderRadius: configNumber(config, "borderRadius", 6),
    messagePaddingX: configNumber(config, "messagePaddingX", 12),
    messagePaddingY: configNumber(config, "messagePaddingY", 8)
  };
}

export default function WidgetDetailPage() {
  const { widgetId } = useParams<{ widgetId: string }>();
  const router = useRouter();
  const [widget, setWidget] = useState<Widget>();
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftOverlayId, setDraftOverlayId] = useState("");
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(160);
  const [zIndex, setZIndex] = useState(1);
  const [chatDraft, setChatDraft] = useState<ChatSettingsDraft>(() => chatSettingsFromConfig({}));
  const [chatPreviewMessages, setChatPreviewMessages] = useState<PreviewChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const socketRef = useRef<Socket | null>(null);

  const widgetConfig = configObject(widget);
  const widgetUrl = widget && APP_URL ? `${APP_URL}/widget/${widget.id}` : "";
  const isChatWidget = widget?.type === "CHAT_WIDGET";
  const selectedOverlay = overlays.find((overlay) => overlay.id === draftOverlayId);
  const previewConfig = isChatWidget ? { ...widgetConfig, ...chatDraft } : widgetConfig;

  const previewWidget = useMemo<OverlayWidget | null>(() => {
    if (!widget) return null;
    return {
      id: widget.id,
      name: draftName || widget.name,
      type: widget.type,
      positionX: 0,
      positionY: 0,
      width: Math.max(1, width || widget.width),
      height: Math.max(1, height || widget.height),
      zIndex,
      visibility: true,
      config: previewConfig,
      state: widget.state && typeof widget.state.state === "object" && !Array.isArray(widget.state.state)
        ? { state: widget.state.state as Record<string, unknown> }
        : undefined
    };
  }, [draftName, height, previewConfig, widget, width, zIndex]);

  const deferredPreviewWidget = useDeferredValue(previewWidget);
  const deferredChatMessages = useDeferredValue(chatPreviewMessages);

  function syncDraft(nextWidget: Widget) {
    setWidget(nextWidget);
    setDraftName(nextWidget.name);
    setDraftOverlayId(nextWidget.overlayId ?? "");
    setPositionX(nextWidget.positionX);
    setPositionY(nextWidget.positionY);
    setWidth(nextWidget.width);
    setHeight(nextWidget.height);
    setZIndex(nextWidget.zIndex);
    setChatDraft(chatSettingsFromConfig(configObject(nextWidget)));
  }

  async function load() {
    try {
      setError("");
      const [nextWidget, nextOverlays] = await Promise.all([api<Widget>(`/widgets/${widgetId}`), api<Overlay[]>("/overlays")]);
      syncDraft(nextWidget);
      setOverlays(nextOverlays);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลด Widget ไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
  }, [widgetId]);

  async function loadPreviewChatMessages(overlay: Overlay | undefined) {
    if (!overlay) {
      setChatPreviewMessages([]);
      return;
    }
    const events = await api<EventLog[]>("/events");
    const messages = events
      .map(chatMessageFromEvent)
      .filter((item): item is PreviewChatMessage => Boolean(item))
      .filter((item) => item.overlayId === overlay.id || item.overlayToken === overlay.token)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-50);
    setChatPreviewMessages(messages);
  }

  useEffect(() => {
    if (!isChatWidget) {
      setChatPreviewMessages([]);
      return;
    }
    void loadPreviewChatMessages(selectedOverlay).catch(() => undefined);
  }, [isChatWidget, selectedOverlay?.id, selectedOverlay?.token]);

  useEffect(() => {
    if (!isChatWidget || !selectedOverlay?.token) return;
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    const joinRoom = () => socket.emit("overlay.join", { token: selectedOverlay.token });
    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);
    socket.on("chat.message", (payload: PreviewChatMessage) => {
      if ((payload.overlayId && payload.overlayId !== selectedOverlay.id) || (payload.overlayToken && payload.overlayToken !== selectedOverlay.token)) return;
      setChatPreviewMessages((current) => mergeChatMessages(current, [payload]));
    });

    return () => {
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [isChatWidget, selectedOverlay?.id, selectedOverlay?.token]);

  async function updateWidget(data: Partial<Widget> & { config?: Record<string, unknown> }, successMessage?: string) {
    try {
      setBusy(true);
      setError("");
      setMessage("");
      const nextWidget = await api<Widget>(`/widgets/${widgetId}`, { method: "PATCH", body: JSON.stringify(data) });
      syncDraft(nextWidget);
      if (successMessage) setMessage(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปเดต Widget ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function saveLayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) {
      setError("กรุณาใส่ชื่อ Widget");
      return;
    }
    await updateWidget({ name, overlayId: draftOverlayId || null, positionX, positionY, width, height, zIndex }, "บันทึกข้อมูล Widget แล้ว");
  }

  async function saveChatSettings() {
    await updateWidget({ config: { ...widgetConfig, ...chatDraft } }, "บันทึกการตั้งค่า Chat แล้ว");
  }

  async function testTrigger() {
    try {
      setBusy(true);
      setError("");
      setMessage("");
      await api(`/widgets/${widgetId}/test-trigger`, { method: "POST" });
      setMessage("ส่ง Test Trigger แล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่ง Test Trigger ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function deleteWidget() {
    if (!widget) return;
    if (!window.confirm(`ลบ Widget "${widget.name}"?`)) return;
    try {
      setBusy(true);
      setError("");
      await api(`/widgets/${widgetId}`, { method: "DELETE" });
      router.push("/dashboard/widgets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ Widget ไม่สำเร็จ");
      setBusy(false);
    }
  }

  async function copyWidgetUrl() {
    const copied = await copyText(widgetUrl);
    if (copied) {
      setError("");
      setMessage("คัดลอก Widget URL แล้ว");
    } else {
      setMessage("");
      setError("คัดลอก Widget URL ไม่สำเร็จ");
    }
  }

  return (
    <DashboardShell title="จัดการ Widget">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/widgets">กลับไปหน้า Widgets</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {widget ? <Badge tone={widget.isEnabled ? "success" : "neutral"}>{widget.isEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge> : null}
          {widget ? <Badge tone={widget.visibility ? "info" : "neutral"}>{widget.visibility ? "แสดงบน Overlay" : "ซ่อนบน Overlay"}</Badge> : null}
        </div>
      </div>

      <div className="mb-4 space-y-3">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {message ? <Notice tone="success">{message}</Notice> : null}
      </div>

      <div className="flex flex-col-reverse gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <ResourceCard>
            <div className="mb-5">
              <p className="text-2xl font-bold text-white">{widget?.name ?? "กำลังโหลด"}</p>
              <p className="mt-1 text-sm text-ink-subtle">
                {widget ? `${widget.type} · ${widget.overlay?.name ?? "ยังไม่ผูก Overlay"}` : "กำลังโหลดข้อมูล Widget"}
              </p>
            </div>

            <form className="grid gap-4 lg:grid-cols-2" onSubmit={(event) => void saveLayout(event)}>
              <Field label="ชื่อ Widget">
                <Input disabled={busy || !widget} onChange={(event) => setDraftName(event.target.value)} value={draftName} />
              </Field>
              <Field label="Overlay">
                <Select disabled={busy || !widget} onChange={(event) => setDraftOverlayId(event.target.value)} value={draftOverlayId}>
                  <option value="">ยังไม่ผูก Overlay</option>
                  {overlays.map((overlay) => (
                    <option key={overlay.id} value={overlay.id}>{overlay.name}</option>
                  ))}
                </Select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 xl:grid-cols-5">
                <NumberField disabled={busy || !widget} label="X" onChange={setPositionX} value={positionX} />
                <NumberField disabled={busy || !widget} label="Y" onChange={setPositionY} value={positionY} />
                <NumberField disabled={busy || !widget} label="กว้าง" min={1} onChange={setWidth} value={width} />
                <NumberField disabled={busy || !widget} label="สูง" min={1} onChange={setHeight} value={height} />
                <NumberField disabled={busy || !widget} label="Layer" onChange={setZIndex} value={zIndex} />
              </div>

              <div className="flex flex-wrap gap-2 lg:col-span-2">
                <Button disabled={busy || !widget} type="submit">บันทึกข้อมูลหลัก</Button>
                <Button variant="secondary" disabled={busy || !widget} onClick={() => widget && void updateWidget({ isEnabled: !widget.isEnabled }, widget.isEnabled ? "ปิดใช้งาน Widget แล้ว" : "เปิดใช้งาน Widget แล้ว")} type="button">
                  {widget?.isEnabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </Button>
                <Button variant="secondary" disabled={busy || !widget} onClick={() => widget && void updateWidget({ visibility: !widget.visibility }, widget.visibility ? "ซ่อน Widget แล้ว" : "แสดง Widget แล้ว")} type="button">
                  {widget?.visibility ? "ซ่อนบน Overlay" : "แสดงบน Overlay"}
                </Button>
                <Button variant="secondary" disabled={busy || !widget} onClick={() => void testTrigger()} type="button">Test Trigger</Button>
              </div>
            </form>
          </ResourceCard>

          {isChatWidget ? (
            <ChatWidgetSettings busy={busy} draft={chatDraft} onDraftChange={setChatDraft} onReset={() => setChatDraft(chatSettingsFromConfig({}))} onSave={saveChatSettings} />
          ) : null}

          <ResourceCard>
            <p className="text-base font-semibold text-white">Widget URL สำหรับ OBS</p>
            <p className="mt-2 break-all rounded-none border-2 border-border-base bg-surface-base px-4 py-3 text-sm text-ink-subtle">{widgetUrl || "กำลังโหลด URL"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || !widgetUrl} onClick={() => void copyWidgetUrl()} type="button">คัดลอก Widget URL</Button>
              {widgetUrl ? (
                <Button size="sm" variant="ghost" asChild>
                  <a href={`${widgetUrl}?debug=1`} rel="noreferrer" target="_blank">เปิด Preview แยก</a>
                </Button>
              ) : null}
            </div>
          </ResourceCard>

          <ResourceCard>
            <p className="text-base font-semibold text-white">การจัดการ</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="destructive" disabled={busy || !widget} onClick={() => void deleteWidget()} type="button">ลบ Widget</Button>
            </div>
          </ResourceCard>
        </div>

        <aside className="sticky top-28 z-20 self-start xl:top-32">
          <ResourceCard>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-white">Live Preview</p>
                <p className="mt-1 text-xs font-medium text-ink-subtle">อัปเดตทันทีระหว่างปรับค่า</p>
              </div>
              <Badge tone="info">{Math.max(1, width || 0)} x {Math.max(1, height || 0)}</Badge>
            </div>
            <div
              className="relative overflow-auto rounded-none border-2 border-border-base bg-surface-dark max-h-[40vh] xl:max-h-[70vh]"
              style={{
                backgroundImage:
                  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><rect width='10' height='10' fill='%231e293b'/><rect x='10' y='10' width='10' height='10' fill='%231e293b'/><rect x='10' width='10' height='10' fill='%230f172a'/><rect y='10' width='10' height='10' fill='%230f172a'/></svg>")`
              }}
            >
              <div className="relative" style={{ width: Math.max(1, width || 400), height: Math.max(1, height || 160) }}>
                {deferredPreviewWidget ? <WidgetRenderer widget={deferredPreviewWidget} chatMessages={isChatWidget ? deferredChatMessages : []} /> : null}
              </div>
            </div>
          </ResourceCard>
        </aside>
      </div>
    </DashboardShell>
  );
}

function NumberField({ disabled, label, min, onChange, value }: { disabled: boolean; label: string; min?: number; onChange: (value: number) => void; value: number }) {
  return (
    <Field label={label}>
      <Input disabled={disabled} min={min} onChange={(event) => onChange(Number(event.target.value))} type="number" value={value} />
    </Field>
  );
}

function ChatWidgetSettings({
  busy,
  draft,
  onDraftChange,
  onReset,
  onSave
}: {
  busy: boolean;
  draft: ChatSettingsDraft;
  onDraftChange: (draft: ChatSettingsDraft) => void;
  onReset: () => void;
  onSave: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"core" | "display" | "colors" | "spacing">("core");

  function setValue<K extends keyof ChatSettingsDraft>(key: K, value: ChatSettingsDraft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  return (
    <ResourceCard>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-semibold text-white">ปรับแต่ง Chat Widget</p>
          <p className="mt-1 text-xs font-medium text-ink-subtle">เลือกหมวดหมู่ที่ต้องการตั้งค่าด้านล่าง</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void onSave()} type="button">บันทึก Chat</Button>
          <Button disabled={busy} onClick={onReset} type="button" variant="secondary">รีเซ็ต</Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b-2 border-border-base pb-4">
        <TabButton active={activeTab === "core"} onClick={() => setActiveTab("core")}>หลัก</TabButton>
        <TabButton active={activeTab === "display"} onClick={() => setActiveTab("display")}>การแสดงผล</TabButton>
        <TabButton active={activeTab === "colors"} onClick={() => setActiveTab("colors")}>สี</TabButton>
        <TabButton active={activeTab === "spacing"} onClick={() => setActiveTab("spacing")}>ขนาดและระยะห่าง</TabButton>
      </div>

      <div className="min-h-[380px] space-y-5">
        {activeTab === "core" ? (
          <SettingsSection title="หลัก">
            <div className="grid gap-4 lg:grid-cols-4">
              <NumberField disabled={busy} label="จำนวนข้อความ" min={1} onChange={(value) => setValue("maxMessages", value)} value={draft.maxMessages} />
              <Field label="เรียงข้อความ">
                <Select disabled={busy} value={draft.order} onChange={(event) => setValue("order", event.target.value)}>
                  <option value="newest-bottom">ข้อความใหม่อยู่ล่าง</option>
                  <option value="newest-top">ข้อความใหม่อยู่บน</option>
                </Select>
              </Field>
              <Field label="จัดแนว">
                <Select disabled={busy} value={draft.align} onChange={(event) => setValue("align", event.target.value)}>
                  <option value="left">ซ้าย</option>
                  <option value="right">ขวา</option>
                </Select>
              </Field>
              <Field label="สไตล์กล่อง">
                <Select disabled={busy} value={draft.bubbleStyle} onChange={(event) => setValue("bubbleStyle", event.target.value)}>
                  <option value="glass">Glass</option>
                  <option value="solid">Solid</option>
                  <option value="outline">Outline</option>
                  <option value="minimal">Minimal</option>
                </Select>
              </Field>
            </div>
          </SettingsSection>
        ) : null}

        {activeTab === "display" ? (
          <SettingsSection title="การแสดงผล">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <ToggleField disabled={busy} label="Avatar" checked={draft.showAvatar} onChange={(value) => setValue("showAvatar", value)} />
              <ToggleField disabled={busy} label="ชื่อผู้ส่ง" checked={draft.showName} onChange={(value) => setValue("showName", value)} />
              <ToggleField disabled={busy} label="โลโก้แพลตฟอร์ม" checked={draft.showPlatformLogo} onChange={(value) => setValue("showPlatformLogo", value)} />
              <ToggleField disabled={busy} label="ข้อความรอแชท" checked={draft.showEmptyState} onChange={(value) => setValue("showEmptyState", value)} />
              <ToggleField disabled={busy} label="Animation" checked={draft.animateMessages} onChange={(value) => setValue("animateMessages", value)} />
              <ToggleField disabled={busy} label="Compact mode" checked={draft.compactMode} onChange={(value) => setValue("compactMode", value)} />
              <ToggleField disabled={busy} label="เงาตัวอักษร" checked={draft.textShadow} onChange={(value) => setValue("textShadow", value)} />
            </div>
          </SettingsSection>
        ) : null}

        {activeTab === "colors" ? (
          <SettingsSection title="สี">
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              <ColorField disabled={busy} label="พื้นหลัง" value={draft.backgroundColor} onChange={(value) => setValue("backgroundColor", value)} />
              <ColorField disabled={busy} label="กล่องข้อความ" value={draft.bubbleColor} onChange={(value) => setValue("bubbleColor", value)} />
              <ColorField disabled={busy} label="ข้อความ" value={draft.textColor} onChange={(value) => setValue("textColor", value)} />
              <ColorField disabled={busy} label="ชื่อ TikTok" value={draft.tiktokNameColor} onChange={(value) => setValue("tiktokNameColor", value)} />
              <ColorField disabled={busy} label="ชื่อ YouTube" value={draft.youtubeNameColor} onChange={(value) => setValue("youtubeNameColor", value)} />
            </div>
          </SettingsSection>
        ) : null}

        {activeTab === "spacing" ? (
          <SettingsSection title="ขนาดและระยะห่าง">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <RangeField disabled={busy} label="Opacity พื้นหลัง" min={0} max={1} step={0.05} value={draft.backgroundOpacity} onChange={(value) => setValue("backgroundOpacity", value)} />
              <RangeField disabled={busy} label="Opacity กล่อง" min={0} max={1} step={0.05} value={draft.bubbleOpacity} onChange={(value) => setValue("bubbleOpacity", value)} />
              <RangeField disabled={busy} label="Opacity เส้นขอบ" min={0} max={1} step={0.05} value={draft.borderOpacity} onChange={(value) => setValue("borderOpacity", value)} />
              <RangeField disabled={busy} label="ข้อความ" min={10} max={36} step={1} value={draft.fontSize} onChange={(value) => setValue("fontSize", value)} />
              <RangeField disabled={busy} label="ชื่อ" min={10} max={28} step={1} value={draft.nameFontSize} onChange={(value) => setValue("nameFontSize", value)} />
              <RangeField disabled={busy} label="Avatar" min={18} max={80} step={1} value={draft.avatarSize} onChange={(value) => setValue("avatarSize", value)} />
              <RangeField disabled={busy} label="Padding Widget" min={0} max={40} step={1} value={draft.padding} onChange={(value) => setValue("padding", value)} />
              <RangeField disabled={busy} label="ระยะห่างข้อความ" min={0} max={28} step={1} value={draft.gap} onChange={(value) => setValue("gap", value)} />
              <RangeField disabled={busy} label="มุมกล่อง" min={0} max={32} step={1} value={draft.borderRadius} onChange={(value) => setValue("borderRadius", value)} />
              <RangeField disabled={busy} label="Padding แนวนอน" min={4} max={32} step={1} value={draft.messagePaddingX} onChange={(value) => setValue("messagePaddingX", value)} />
              <RangeField disabled={busy} label="Padding แนวตั้ง" min={2} max={24} step={1} value={draft.messagePaddingY} onChange={(value) => setValue("messagePaddingY", value)} />
            </div>
          </SettingsSection>
        ) : null}
      </div>
    </ResourceCard>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-none border-2 px-4 py-2 text-sm font-bold uppercase tracking-widest transition-all ${
        active 
          ? "border-primary bg-primary text-black shadow-brutal-sm" 
          : "border-transparent bg-transparent text-ink-subtle hover:border-border-base hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function SettingsSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section>
      <p className="mb-4 text-sm font-semibold text-ink-muted">{title}</p>
      {children}
    </section>
  );
}

function ToggleField({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-none border-2 border-border-base bg-surface-base px-4 py-3 text-sm font-medium text-ink-muted">
      <span>{label}</span>
      <input checked={checked} className="h-4 w-4 accent-primary" disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function ColorField({ disabled, label, onChange, value }: { disabled: boolean; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <Field label={label}>
      <div className="flex min-w-0 gap-2">
        <input
          className="h-12 w-12 shrink-0 cursor-pointer rounded-none border-2 border-border-base bg-surface-base p-1 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={value}
        />
        <Input className="min-w-0 font-mono" disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value} />
      </div>
    </Field>
  );
}

function RangeField({ disabled, label, max, min, onChange, step, value }: { disabled: boolean; label: string; max: number; min: number; onChange: (value: number) => void; step: number; value: number }) {
  return (
    <Field label={`${label}: ${value}`}>
      <Input disabled={disabled} max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="range" value={value} />
    </Field>
  );
}
