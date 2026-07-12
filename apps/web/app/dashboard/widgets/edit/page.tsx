"use client";

import { Button } from "@ezstream/ui";
import type { UnifiedChatMessage } from "@ezstream/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState, useDeferredValue, Suspense } from "react";
import { io, type Socket } from "socket.io-client";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { ResourceCard } from "../../../../components/resource-card";
import { WidgetRenderer, type OverlayWidget } from "../../../../components/widget-renderer";
import { Badge, Field, Input, Notice, Select } from "../../../../components/ui-kit";
import { API_URL, APP_URL, api } from "../../../../lib/api";
import { copyText } from "../../../../lib/clipboard";
import { useUnsavedChangesWarning } from "../../../../lib/use-unsaved-changes-warning";
import { ConfirmDeleteModal } from "../../../../components/confirm-delete-modal";
import { CheckIcon, CopyIcon } from "../../../../components/icons";
import { NumberField } from "../../../../components/widget-settings/fields";
import { chatSettingsFromConfig, ChatWidgetSettings, type ChatSettingsDraft } from "../../../../components/widget-settings/chat-settings";
import { viewerCountSettingsFromConfig, ViewerCountWidgetSettings } from "../../../../components/widget-settings/viewer-count-settings";
import { alertSettingsFromConfig, AlertWidgetSettings, type AlertSettingsDraft } from "../../../../components/widget-settings/alert-settings";
import { goalSettingsFromConfig, GoalWidgetSettings, type GoalSettingsDraft } from "../../../../components/widget-settings/goal-settings";

type Overlay = { id: string; name: string; token: string; width: number; height: number };
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


function configObject(widget: Widget | undefined) {
  return widget?.config && typeof widget.config === "object" && !Array.isArray(widget.config)
    ? (widget.config as Record<string, unknown>)
    : {};
}

function draftFromWidget(widget: Widget): Record<string, unknown> | null {
  const config = configObject(widget);
  switch (widget.type) {
    case "CHAT_WIDGET":
      return chatSettingsFromConfig(config);
    case "VIEWER_COUNT_WIDGET":
      return viewerCountSettingsFromConfig(config);
    case "ALERT_WIDGET":
      return alertSettingsFromConfig(config);
    case "GOAL_WIDGET":
      return goalSettingsFromConfig(config);
    default:
      return null;
  }
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
    platform: stringValue(payload.platform) === "youtube" ? "youtube" : stringValue(payload.platform) === "twitch" ? "twitch" : "tiktok",
    username,
    displayName: stringValue(payload.displayName) ?? username,
    message,
    avatarUrl: stringValue(payload.avatarUrl),
    badges: Array.isArray(payload.badges) ? payload.badges.filter((item): item is { label: string; url?: string } => typeof item === "object" && item !== null && "label" in item) : [],
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

function ScalableWidgetPreview({ children, width, height }: { children: React.ReactNode, width: number, height: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const targetWidth = Math.max(1, width || 400);
  const targetHeight = Math.max(1, height || 160);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const containerWidth = entry.contentRect.width;
        if (containerWidth < targetWidth) {
          setScale(containerWidth / targetWidth);
        } else {
          setScale(1);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [targetWidth]);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full overflow-hidden rounded-none border-2 border-border-base bg-surface-dark transition-all duration-300"
      style={{
        height: targetHeight * scale,
        backgroundImage:
          `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><rect width='10' height='10' fill='%231e293b'/><rect x='10' y='10' width='10' height='10' fill='%231e293b'/><rect x='10' width='10' height='10' fill='%230f172a'/><rect y='10' width='10' height='10' fill='%230f172a'/></svg>")`,
      }}
    >
      <div className="absolute top-0" style={{ left: "50%", width: targetWidth, height: targetHeight, transform: `translateX(-50%) scale(${scale})`, transformOrigin: "top center", flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}



function WidgetDetailContent() {
  const searchParams = useSearchParams();
  const widgetId = searchParams.get("id") ?? "";
  const router = useRouter();
  const [widget, setWidget] = useState<Widget>();
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftOverlayId, setDraftOverlayId] = useState("");
  const [positionX, setPositionX] = useState<number | "">(0);
  const [positionY, setPositionY] = useState<number | "">(0);
  const [width, setWidth] = useState<number | "">(400);
  const [height, setHeight] = useState<number | "">(160);
  const [zIndex, setZIndex] = useState<number | "">(1);
  const [configDraft, setConfigDraft] = useState<Record<string, unknown> | null>(null);
  const [chatPreviewMessages, setChatPreviewMessages] = useState<PreviewChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const widgetConfig = configObject(widget);
  const widgetUrl = widget && APP_URL ? `${APP_URL}/widget?id=${widget.id}` : "";
  const isChatWidget = widget?.type === "CHAT_WIDGET";
  const selectedOverlay = overlays.find((overlay) => overlay.id === draftOverlayId);
  const previewConfig = configDraft ? { ...widgetConfig, ...configDraft } : widgetConfig;

  const previewWidget = useMemo<OverlayWidget | null>(() => {
    if (!widget) return null;
    return {
      id: widget.id,
      name: draftName || widget.name,
      type: widget.type,
      positionX: 0,
      positionY: 0,
      width: Math.max(1, Number(width) || widget.width),
      height: Math.max(1, Number(height) || widget.height),
      zIndex: Number(zIndex) || 0,
      visibility: true,
      config: previewConfig,
      state: widget.state && typeof widget.state.state === "object" && !Array.isArray(widget.state.state)
        ? { state: widget.state.state as Record<string, unknown> }
        : undefined
    };
  }, [draftName, height, previewConfig, widget, width, zIndex]);

  const deferredPreviewWidget = useDeferredValue(previewWidget);
  const deferredChatMessages = useDeferredValue(chatPreviewMessages);

  const isCoreDirty = useMemo(() => {
    if (!widget) return false;
    
    if (draftName !== widget.name) return true;
    if (draftOverlayId !== (widget.overlayId ?? "")) return true;
    if (Number(positionX) !== widget.positionX) return true;
    if (Number(positionY) !== widget.positionY) return true;
    if (Number(width) !== widget.width) return true;
    if (Number(height) !== widget.height) return true;
    if (Number(zIndex) !== widget.zIndex) return true;

    return false;
  }, [widget, draftName, draftOverlayId, positionX, positionY, width, height, zIndex]);

  const isConfigDirty = useMemo(() => {
    if (!widget || !configDraft) return false;
    const original = draftFromWidget(widget);
    return original ? JSON.stringify(configDraft) !== JSON.stringify(original) : false;
  }, [widget, configDraft]);

  const isDirty = isCoreDirty || isConfigDirty;

  const handleSaveAndLeave = async () => {
    let updates: any = {};
    if (isCoreDirty) {
      const name = draftName.trim();
      if (!name) {
        setError("กรุณาใส่ชื่อ Widget");
        return false;
      }
      updates = {
        name,
        overlayId: draftOverlayId || null,
        positionX: Number(positionX) || 0,
        positionY: Number(positionY) || 0,
        width: Number(width) || 400,
        height: Number(height) || 160,
        zIndex: Number(zIndex) || 1
      };
    }
    if (isConfigDirty && configDraft) {
      updates.config = { ...widgetConfig, ...configDraft };
    }
    
    if (Object.keys(updates).length > 0) {
      try {
        setBusy(true);
        setError("");
        setMessage("");
        const nextWidget = await api<Widget>(`/widgets/${widgetId}`, { method: "PATCH", body: JSON.stringify(updates) });
        syncDraft(nextWidget);
        setMessage("บันทึกข้อมูลและออกสำเร็จ");
      } catch (err) {
        setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
        setBusy(false);
        return false;
      }
    }
    return true;
  };

  const { UnsavedChangesModal } = useUnsavedChangesWarning(isDirty, handleSaveAndLeave);

  function syncDraft(nextWidget: Widget) {
    setWidget(nextWidget);
    setDraftName(nextWidget.name);
    setDraftOverlayId(nextWidget.overlayId ?? "");
    setPositionX(nextWidget.positionX);
    setPositionY(nextWidget.positionY);
    setWidth(nextWidget.width);
    setHeight(nextWidget.height);
    setZIndex(nextWidget.zIndex);
    setConfigDraft(draftFromWidget(nextWidget));
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
    await updateWidget({ 
      name, 
      overlayId: draftOverlayId || null, 
      positionX: Number(positionX) || 0, 
      positionY: Number(positionY) || 0, 
      width: Number(width) || 400, 
      height: Number(height) || 160, 
      zIndex: Number(zIndex) || 1 
    }, "บันทึกข้อมูล Widget แล้ว");
  }

  async function saveConfigSettings() {
    if (!configDraft) return;
    await updateWidget({ config: { ...widgetConfig, ...configDraft } }, "บันทึกการตั้งค่า Widget แล้ว");
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

  function deleteWidget() {
    if (!widget) return;
    setIsConfirmDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!widget) return;
    try {
      setBusy(true);
      setError("");
      await api(`/widgets/${widgetId}`, { method: "DELETE" });
      router.push("/dashboard/widgets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ Widget ไม่สำเร็จ");
      setBusy(false);
      setIsConfirmDeleteOpen(false);
    }
  }

  async function copyWidgetUrl() {
    const copied = await copyText(widgetUrl);
    if (copied) {
      setError("");
      setMessage("คัดลอก Widget URL แล้ว");
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
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

      <div className="flex flex-col-reverse gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(420px,auto)]">
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
                <NumberField disabled={busy || !widget} label="ความกว้าง (Width)" min={1} max={widget?.overlay?.width ?? 1920} onChange={setWidth} value={width} />
                <NumberField disabled={busy || !widget} label="ความสูง (Height)" min={1} max={widget?.overlay?.height ?? 1080} onChange={setHeight} value={height} />
                <NumberField disabled={busy || !widget} label="Layer" onChange={setZIndex} value={zIndex} />
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
                <Button 
                  disabled={busy || !widget} 
                  type="submit"
                  className={isCoreDirty ? "bg-rose-600 text-white hover:bg-rose-500 border-rose-500 animate-pulse shadow-rose-900/20" : ""}
                >
                  บันทึกข้อมูลหลัก
                </Button>
                <Button variant="secondary" disabled={busy || !widget} onClick={() => widget && void updateWidget({ isEnabled: !widget.isEnabled }, widget.isEnabled ? "ปิดใช้งาน Widget แล้ว" : "เปิดใช้งาน Widget แล้ว")} type="button">
                  {widget?.isEnabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </Button>
                <Button variant="secondary" disabled={busy || !widget} onClick={() => widget && void updateWidget({ visibility: !widget.visibility }, widget.visibility ? "ซ่อน Widget แล้ว" : "แสดง Widget แล้ว")} type="button">
                  {widget?.visibility ? "ซ่อนบน Overlay" : "แสดงบน Overlay"}
                </Button>
              </div>
            </form>
          </ResourceCard>

          {widget && configDraft && widget.type === "CHAT_WIDGET" ? (
            <ChatWidgetSettings
              busy={busy}
              draft={configDraft as ChatSettingsDraft}
              isDirty={isConfigDirty}
              onDraftChange={setConfigDraft}
              onReset={() => setConfigDraft(chatSettingsFromConfig({}))}
              onSave={saveConfigSettings}
            />
          ) : null}

          {widget && configDraft && widget.type === "VIEWER_COUNT_WIDGET" ? (
            <ViewerCountWidgetSettings busy={busy} draft={configDraft} isDirty={isConfigDirty} onDraftChange={setConfigDraft} onSave={saveConfigSettings} />
          ) : null}

          {widget && configDraft && widget.type === "ALERT_WIDGET" ? (
            <AlertWidgetSettings busy={busy} draft={configDraft as AlertSettingsDraft} isDirty={isConfigDirty} onDraftChange={setConfigDraft} onSave={saveConfigSettings} />
          ) : null}

          {widget && configDraft && widget.type === "GOAL_WIDGET" ? (
            <GoalWidgetSettings busy={busy} draft={configDraft as GoalSettingsDraft} isDirty={isConfigDirty} onDraftChange={setConfigDraft} onSave={saveConfigSettings} />
          ) : null}

          <ResourceCard>
            <p className="text-base font-semibold text-white">Widget URL สำหรับโปรแกรมสตรีม (เช่น OBS)</p>
            <p className="mt-1 text-xs font-medium text-amber-400">
              💡 แนะนำ: กรุณาตั้งค่าความกว้าง (Width) และความสูง (Height) ใน OBS ให้ตรงกับที่ตั้งไว้ในข้อมูลหลัก
            </p>
            <p className="mt-2 break-all rounded-none border-2 border-border-base bg-surface-base px-4 py-3 text-sm text-ink-subtle">{widgetUrl || "กำลังโหลด URL"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || !widgetUrl}
                onClick={() => void copyWidgetUrl()}
                type="button"
                className={isCopied ? "bg-emerald-600 text-white hover:bg-emerald-500 border-emerald-500 shadow-emerald-900/20" : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20"}
              >
                {isCopied ? (
                  <>
                    <CheckIcon className="mr-2 h-4 w-4" /> คัดลอกสำเร็จ!
                  </>
                ) : (
                  <>
                    <CopyIcon className="mr-2 h-4 w-4" /> คัดลอก Widget URL
                  </>
                )}
              </Button>
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
              <Badge tone="info">{Math.max(1, Number(width) || 0)} x {Math.max(1, Number(height) || 0)}</Badge>
            </div>
            {widget && (widget.type === "TTS_WIDGET" || widget.type === "SOUND_WIDGET") ? (
              <div className="border-2 border-dashed border-border-base bg-surface-dark p-6 text-center">
                <p className="text-sm font-semibold text-white">🔊 Widget เสียง — ไม่มีภาพบนสตรีม</p>
                <p className="mt-1 text-xs text-ink-subtle">widget นี้เล่นเสียงอย่างเดียว จะไม่แสดงอะไรบน Overlay/OBS</p>
              </div>
            ) : (
              <ScalableWidgetPreview width={Number(width) || 400} height={Number(height) || 160}>
                {deferredPreviewWidget ? <WidgetRenderer widget={deferredPreviewWidget} chatMessages={isChatWidget ? deferredChatMessages : []} /> : null}
              </ScalableWidgetPreview>
            )}
          </ResourceCard>
        </aside>
      </div>
      {UnsavedChangesModal}
      
      <ConfirmDeleteModal 
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
        title="ลบ Widget"
        itemName={widget?.name ?? ""}
      />
    </DashboardShell>
  );
}










export default function WidgetDetailPage() {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-white">กำลังโหลดข้อมูล Widget...</div>}>
      <WidgetDetailContent />
    </Suspense>
  );
}
