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
  showBadges: boolean;
  badgesPosition: string;
  showEmptyState: boolean;
  animateMessages: boolean;
  compactMode: boolean;
  inlineMessage: boolean;
  nameMessageSpacing: number;
  verticalAlign: string;
  textShadow: boolean;
  backgroundColor: string;
  bubbleColor: string;
  textColor: string;
  tiktokNameColor: string;
  youtubeNameColor: string;
  twitchNameColor: string;
  backgroundOpacity: number;
  bubbleOpacity: number;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  borderOpacity: number;
  separateBubbles: boolean;
  nameBubbleColor: string;
  nameBubbleOpacity: number;
  nameBorderWidth: number;
  nameBorderRadius: number;
  nameBorderColor: string;
  nameBorderOpacity: number;
  nameBubbleDropShadow: boolean;
  nameBubbleShadowColor: string;
  nameBubbleShadowOpacity: number;
  nameBubbleShadowX: number;
  nameBubbleShadowY: number;
  nameBubbleShadowBlur: number;
  nameBubbleGradient: boolean;
  nameBubbleGradientColor: string;
  nameBubbleGradientAngle: number;
  fontSize: number;
  nameFontSize: number;
  avatarSize: number;
  padding: number;
  gap: number;
  messagePaddingX: number;
  messagePaddingY: number;
  fontWeight: string;
  avatarShape: string;
  animationType: string;
  textStrokeWidth: number;
  textStrokeColor: string;
  nameTextStrokeWidth: number;
  nameTextStrokeColor: string;
  nameFontWeight: string;
  nameFontFamily: string;
  hideAfter: number;
  exitAnimationType: string;
  textShadowColor: string;
  textShadowOpacity: number;
  textShadowX: number;
  textShadowY: number;
  textShadowBlur: number;
  nameTextShadow: boolean;
  nameTextShadowColor: string;
  nameTextShadowOpacity: number;
  nameTextShadowX: number;
  nameTextShadowY: number;
  nameTextShadowBlur: number;
  bubbleDropShadow: boolean;
  bubbleShadowColor: string;
  bubbleShadowOpacity: number;
  bubbleShadowX: number;
  bubbleShadowY: number;
  bubbleShadowBlur: number;
  animationDuration: number;
  backgroundGradient: boolean;
  backgroundGradientColor: string;
  backgroundGradientAngle: number;
  bubbleGradient: boolean;
  bubbleGradientColor: string;
  bubbleGradientAngle: number;
  useOwnerTextColor: boolean;
  ownerTextColor: string;
  useModTextColor: boolean;
  modTextColor: string;
  useMemberTextColor: boolean;
  memberTextColor: string;
  useOwnerNameColor: boolean;
  ownerNameColor: string;
  useModNameColor: boolean;
  modNameColor: string;
  useMemberNameColor: boolean;
  memberNameColor: string;
  randomNameColor: boolean;
  maxNameLength: number;
  avatarBorderWidth: number;
  avatarBorderColor: string;
  avatarBorderOpacity: number;
  platformLogoSize: number;
  platformLogoBorderWidth: number;
  platformLogoBorderColor: string;
  platformLogoBorderOpacity: number;
  badgeSize: number;
  badgeBorderWidth: number;
  badgeBorderColor: string;
  badgeBorderOpacity: number;
};

function configObject(widget: Widget | undefined) {
  return widget?.config && typeof widget.config === "object" && !Array.isArray(widget.config)
    ? (widget.config as Record<string, unknown>)
    : {};
}

function configNumber(config: Record<string, unknown>, key: string, fallback: number) {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function configString(config: Record<string, unknown>, key: string, fallback: string) {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

function configBool(config: Record<string, unknown>, key: string, fallback: boolean) {
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

function chatSettingsFromConfig(config: Record<string, unknown>): ChatSettingsDraft {
  return {
    maxMessages: configNumber(config, "maxMessages", 8),
    order: configString(config, "order", "newest-bottom"),
    align: configString(config, "align", "left"),
    verticalAlign: configString(config, "verticalAlign", "bottom"),
    bubbleStyle: "solid",
    fontFamily: configString(config, "fontFamily", "system"),
    fontWeight: configString(config, "fontWeight", "normal"),
    nameFontFamily: configString(config, "nameFontFamily", ""),
    nameFontWeight: configString(config, "nameFontWeight", "bold"),
    showAvatar: configBool(config, "showAvatar", true),
    showName: configBool(config, "showName", true),
    showPlatformLogo: configBool(config, "showPlatformLogo", true),
    showBadges: configBool(config, "showBadges", true),
    badgesPosition: configString(config, "badgesPosition", "after_name"),
    showEmptyState: configBool(config, "showEmptyState", true),
    animateMessages: configBool(config, "animateMessages", true),
    compactMode: configBool(config, "compactMode", false),
    inlineMessage: configBool(config, "inlineMessage", false),
    nameMessageSpacing: configNumber(config, "nameMessageSpacing", 4),
    textShadow: configBool(config, "textShadow", true),
    backgroundColor: configString(config, "backgroundColor", "#000000"),
    bubbleColor: configString(config, "bubbleColor", "#000000"),
    textColor: configString(config, "textColor", "#ffffff"),
    tiktokNameColor: configString(config, "tiktokNameColor", "#f9a8d4"),
    youtubeNameColor: configString(config, "youtubeNameColor", "#fca5a5"),
    twitchNameColor: configString(config, "twitchNameColor", "#c4b5fd"),
    backgroundOpacity: configNumber(config, "backgroundOpacity", 0),
    bubbleOpacity: configNumber(config, "bubbleOpacity", 0.55),
    borderOpacity: configNumber(config, "borderOpacity", 0.1),
    borderWidth: configNumber(config, "borderWidth", 1),
    borderColor: configString(config, "borderColor", "#ffffff"),
    separateBubbles: configBool(config, "separateBubbles", false),
    nameBubbleColor: configString(config, "nameBubbleColor", "#000000"),
    nameBubbleOpacity: configNumber(config, "nameBubbleOpacity", 0.55),
    nameBorderWidth: configNumber(config, "nameBorderWidth", 1),
    nameBorderRadius: configNumber(config, "nameBorderRadius", 6),
    nameBorderColor: configString(config, "nameBorderColor", "#ffffff"),
    nameBorderOpacity: configNumber(config, "nameBorderOpacity", 0.1),
    nameBubbleDropShadow: configBool(config, "nameBubbleDropShadow", false),
    nameBubbleShadowColor: configString(config, "nameBubbleShadowColor", "#000000"),
    nameBubbleShadowOpacity: configNumber(config, "nameBubbleShadowOpacity", 0.5),
    nameBubbleShadowX: configNumber(config, "nameBubbleShadowX", 0),
    nameBubbleShadowY: configNumber(config, "nameBubbleShadowY", 4),
    nameBubbleShadowBlur: configNumber(config, "nameBubbleShadowBlur", 8),
    nameBubbleGradient: configBool(config, "nameBubbleGradient", false),
    nameBubbleGradientColor: configString(config, "nameBubbleGradientColor", "#000000"),
    nameBubbleGradientAngle: configNumber(config, "nameBubbleGradientAngle", 180),
    fontSize: configNumber(config, "fontSize", 15),
    nameFontSize: configNumber(config, "nameFontSize", 13),
    avatarSize: configNumber(config, "avatarSize", 32),
    avatarBorderWidth: configNumber(config, "avatarBorderWidth", 2),
    avatarBorderColor: configString(config, "avatarBorderColor", "#ffffff"),
    avatarBorderOpacity: configNumber(config, "avatarBorderOpacity", 0.15),
    platformLogoSize: configNumber(config, "platformLogoSize", 16),
    platformLogoBorderWidth: configNumber(config, "platformLogoBorderWidth", 0),
    platformLogoBorderColor: configString(config, "platformLogoBorderColor", "#ffffff"),
    platformLogoBorderOpacity: configNumber(config, "platformLogoBorderOpacity", 0.15),
    badgeSize: configNumber(config, "badgeSize", 16),
    badgeBorderWidth: configNumber(config, "badgeBorderWidth", 0),
    badgeBorderColor: configString(config, "badgeBorderColor", "#ffffff"),
    badgeBorderOpacity: configNumber(config, "badgeBorderOpacity", 0.15),
    maxNameLength: configNumber(config, "maxNameLength", 0),
    padding: configNumber(config, "padding", 12),
    gap: configNumber(config, "gap", 8),
    borderRadius: configNumber(config, "borderRadius", 6),
    messagePaddingX: configNumber(config, "messagePaddingX", 12),
    messagePaddingY: configNumber(config, "messagePaddingY", 8),
    avatarShape: configString(config, "avatarShape", "circle"),
    animationType: configString(config, "animationType", configBool(config, "animateMessages", true) ? "fade" : "none"),
    exitAnimationType: configString(config, "exitAnimationType", configBool(config, "animateMessages", true) ? "fade" : "none"),
    animationDuration: configNumber(config, "animationDuration", 0.3),
    hideAfter: configNumber(config, "hideAfter", 0),
    textStrokeWidth: configNumber(config, "textStrokeWidth", 0),
    textStrokeColor: configString(config, "textStrokeColor", "#000000"),
    nameTextStrokeWidth: configNumber(config, "nameTextStrokeWidth", configNumber(config, "textStrokeWidth", 0)),
    nameTextStrokeColor: configString(config, "nameTextStrokeColor", configString(config, "textStrokeColor", "#000000")),
    textShadowColor: configString(config, "textShadowColor", "#000000"),
    textShadowOpacity: configNumber(config, "textShadowOpacity", 0.55),
    textShadowX: configNumber(config, "textShadowX", 0),
    textShadowY: configNumber(config, "textShadowY", 1),
    textShadowBlur: configNumber(config, "textShadowBlur", 1),
    nameTextShadow: configBool(config, "nameTextShadow", configBool(config, "textShadow", true)),
    nameTextShadowColor: configString(config, "nameTextShadowColor", configString(config, "textShadowColor", "#000000")),
    nameTextShadowOpacity: configNumber(config, "nameTextShadowOpacity", configNumber(config, "textShadowOpacity", 0.55)),
    nameTextShadowX: configNumber(config, "nameTextShadowX", configNumber(config, "textShadowX", 0)),
    nameTextShadowY: configNumber(config, "nameTextShadowY", configNumber(config, "textShadowY", 1)),
    nameTextShadowBlur: configNumber(config, "nameTextShadowBlur", configNumber(config, "textShadowBlur", 1)),
    bubbleDropShadow: configBool(config, "bubbleDropShadow", false),
    bubbleShadowColor: configString(config, "bubbleShadowColor", "#000000"),
    bubbleShadowOpacity: configNumber(config, "bubbleShadowOpacity", 0.5),
    bubbleShadowX: configNumber(config, "bubbleShadowX", 0),
    bubbleShadowY: configNumber(config, "bubbleShadowY", 4),
    bubbleShadowBlur: configNumber(config, "bubbleShadowBlur", 8),
    backgroundGradient: configBool(config, "backgroundGradient", false),
    backgroundGradientColor: configString(config, "backgroundGradientColor", "#000000"),
    backgroundGradientAngle: configNumber(config, "backgroundGradientAngle", 180),
    bubbleGradient: configBool(config, "bubbleGradient", false),
    bubbleGradientColor: configString(config, "bubbleGradientColor", "#000000"),
    bubbleGradientAngle: configNumber(config, "bubbleGradientAngle", 180),
    useOwnerTextColor: configBool(config, "useOwnerTextColor", false),
    ownerTextColor: configString(config, "ownerTextColor", "#fbbf24"),
    useModTextColor: configBool(config, "useModTextColor", false),
    modTextColor: configString(config, "modTextColor", "#34d399"),
    useMemberTextColor: configBool(config, "useMemberTextColor", false),
    memberTextColor: configString(config, "memberTextColor", "#a78bfa"),
    useOwnerNameColor: configBool(config, "useOwnerNameColor", false),
    ownerNameColor: configString(config, "ownerNameColor", "#fbbf24"),
    useModNameColor: configBool(config, "useModNameColor", false),
    modNameColor: configString(config, "modNameColor", "#34d399"),
    useMemberNameColor: configBool(config, "useMemberNameColor", false),
    memberNameColor: configString(config, "memberNameColor", "#a78bfa"),
    randomNameColor: configBool(config, "randomNameColor", false),
  };
}

function viewerCountSettingsFromConfig(config: Record<string, unknown>) {
  return {
    platforms: configString(config, "platforms", "all"),
    showBackground: configBool(config, "showBackground", true),
    fontSize: configNumber(config, "fontSize", 16),
    iconSize: configNumber(config, "iconSize", 20),
    fontFamily: configString(config, "fontFamily", "Inter"),
    fontWeight: configString(config, "fontWeight", "700"),
    textColor: configString(config, "textColor", "#ffffff"),
    useSeparateColors: configBool(config, "useSeparateColors", false),
    youtubeColor: configString(config, "youtubeColor", "#ef4444"),
    tiktokColor: configString(config, "tiktokColor", "#22d3ee"),
    twitchColor: configString(config, "twitchColor", "#c084fc"),
    textShadow: configBool(config, "textShadow", true),
    backgroundColor: configString(config, "backgroundColor", "#000000"),
    backgroundOpacity: configNumber(config, "backgroundOpacity", 0.7),
    borderRadius: configNumber(config, "borderRadius", 8),
    gap: configNumber(config, "gap", 12),
    paddingX: configNumber(config, "paddingX", 16),
    paddingY: configNumber(config, "paddingY", 8),
    showPingDot: configBool(config, "showPingDot", true),
  };
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
  const [chatDraft, setChatDraft] = useState<ChatSettingsDraft>(() => chatSettingsFromConfig({}));
  const [viewerCountDraft, setViewerCountDraft] = useState<Record<string, any>>(() => viewerCountSettingsFromConfig({}));
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
  const isViewerCountWidget = widget?.type === "VIEWER_COUNT_WIDGET";
  const selectedOverlay = overlays.find((overlay) => overlay.id === draftOverlayId);
  const previewConfig = isChatWidget 
    ? { ...widgetConfig, ...chatDraft } 
    : isViewerCountWidget 
      ? { ...widgetConfig, ...viewerCountDraft } 
      : widgetConfig;

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

  const isChatDirty = useMemo(() => {
    if (!widget || !isChatWidget) return false;
    const originalChatSettings = chatSettingsFromConfig(configObject(widget));
    return JSON.stringify(chatDraft) !== JSON.stringify(originalChatSettings);
  }, [widget, chatDraft, isChatWidget]);

  const isViewerCountDirty = useMemo(() => {
    if (!widget || !isViewerCountWidget) return false;
    const originalSettings = viewerCountSettingsFromConfig(configObject(widget));
    return JSON.stringify(viewerCountDraft) !== JSON.stringify(originalSettings);
  }, [widget, viewerCountDraft, isViewerCountWidget]);

  const isDirty = isCoreDirty || isChatDirty || isViewerCountDirty;

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
    if (isChatDirty) {
      updates.config = { ...widgetConfig, ...chatDraft };
    } else if (isViewerCountDirty) {
      updates.config = { ...widgetConfig, ...viewerCountDraft };
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
    if (nextWidget.type === "CHAT_WIDGET") {
      setChatDraft(chatSettingsFromConfig(configObject(nextWidget)));
    } else if (nextWidget.type === "VIEWER_COUNT_WIDGET") {
      setViewerCountDraft(viewerCountSettingsFromConfig(configObject(nextWidget)));
    }
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

  async function saveChatSettings() {
    await updateWidget({ config: { ...widgetConfig, ...chatDraft } }, "บันทึกการตั้งค่า Chat แล้ว");
  }

  async function saveViewerCountSettings() {
    await updateWidget({ config: { ...widgetConfig, ...viewerCountDraft } }, "บันทึกการตั้งค่า Viewer Count แล้ว");
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
                <NumberField disabled={busy || !widget} label="กว้าง" min={1} max={500} onChange={setWidth} value={width} />
                <NumberField disabled={busy || !widget} label="สูง" min={1} max={1200} onChange={setHeight} value={height} />
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

          {isChatWidget ? (
            <ChatWidgetSettings busy={busy} draft={chatDraft} isDirty={isChatDirty} onDraftChange={setChatDraft} onReset={() => setChatDraft(chatSettingsFromConfig({}))} onSave={saveChatSettings} />
          ) : null}

          {isViewerCountWidget ? (
            <ViewerCountWidgetSettings busy={busy} draft={viewerCountDraft} isDirty={isViewerCountDirty} onDraftChange={setViewerCountDraft} onSave={saveViewerCountSettings} />
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
            <div className="flex w-full justify-center overflow-x-auto scrollbar-hide">
              <div
                className="relative overflow-hidden rounded-none border-2 border-border-base bg-surface-dark transition-all duration-300"
                style={{
                  backgroundImage:
                    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><rect width='10' height='10' fill='%231e293b'/><rect x='10' y='10' width='10' height='10' fill='%231e293b'/><rect x='10' width='10' height='10' fill='%230f172a'/><rect y='10' width='10' height='10' fill='%230f172a'/></svg>")`
                }}
              >
                <div className="relative" style={{ width: Math.max(1, Number(width) || 400), height: Math.max(1, Number(height) || 160) }}>
                  {deferredPreviewWidget ? <WidgetRenderer widget={deferredPreviewWidget} chatMessages={isChatWidget ? deferredChatMessages : []} /> : null}
                </div>
              </div>
            </div>
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

function NumberField({ disabled, label, min, max, onChange, value }: { disabled: boolean; label: string; min?: number; max?: number; onChange: (value: number | "") => void; value: number | "" }) {
  return (
    <Field label={label}>
      <Input disabled={disabled} min={min} max={max} onChange={(event) => {
        let val: number | "" = event.target.value === "" ? "" : Number(event.target.value);
        if (typeof val === "number" && max !== undefined && val > max) val = max;
        onChange(val);
      }} type="number" value={value} />
    </Field>
  );
}

function ChatWidgetSettings({
  busy,
  draft,
  isDirty,
  onDraftChange,
  onReset,
  onSave
}: {
  busy: boolean;
  draft: ChatSettingsDraft;
  isDirty?: boolean;
  onDraftChange: (draft: ChatSettingsDraft) => void;
  onReset: () => void;
  onSave: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"general" | "typography" | "bubble" | "namebadge" | "textcolors" | "icons" | "animations">("general");

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
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            disabled={busy} 
            onClick={() => void onSave()} 
            type="button"
            className={isDirty ? "bg-rose-600 text-white hover:bg-rose-500 border-rose-500 animate-pulse shadow-rose-900/20" : ""}
          >
            บันทึก Chat
          </Button>
          <Button disabled={busy} onClick={onReset} type="button" variant="secondary">รีเซ็ต</Button>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-3 border-b-2 border-border-base pb-6">
        <TabButton active={activeTab === "general"} onClick={() => setActiveTab("general")}>ทั่วไป</TabButton>
        <TabButton active={activeTab === "typography"} onClick={() => setActiveTab("typography")}>ตัวอักษร</TabButton>
        <TabButton active={activeTab === "bubble"} onClick={() => setActiveTab("bubble")}>กล่องแชท</TabButton>
        <TabButton active={activeTab === "namebadge"} onClick={() => setActiveTab("namebadge")}>ป้ายชื่อผู้ส่ง</TabButton>
        <TabButton active={activeTab === "textcolors"} onClick={() => setActiveTab("textcolors")}>สีข้อความและชื่อ</TabButton>
        <TabButton active={activeTab === "icons"} onClick={() => setActiveTab("icons")}>ไอคอนและป้าย</TabButton>
        <TabButton active={activeTab === "animations"} onClick={() => setActiveTab("animations")}>ลูกเล่น</TabButton>
      </div>

      <div className="min-h-[380px] space-y-5">
        {activeTab === "general" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SettingsSection title="ตั้งค่าแชท (Chat Behavior)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <NumberField disabled={busy} label="จำนวนข้อความสูงสุด" min={1} onChange={(value) => setValue("maxMessages", Number(value) || 1)} value={draft.maxMessages} />
                <Field label="เรียงข้อความ">
                  <Select disabled={busy} value={draft.order} onChange={(event) => setValue("order", event.target.value)}>
                    <option value="newest-bottom">ข้อความใหม่อยู่ล่าง</option>
                    <option value="newest-top">ข้อความใหม่อยู่บน</option>
                  </Select>
                </Field>
                <Field label="ชิดขอบ (แนวตั้ง)">
                  <Select disabled={busy} value={draft.verticalAlign} onChange={(event) => setValue("verticalAlign", event.target.value)}>
                    <option value="top">ชิดขอบบน</option>
                    <option value="bottom">ชิดขอบล่าง</option>
                  </Select>
                </Field>
                <Field label="จัดแนว (แนวนอน)">
                  <Select disabled={busy} value={draft.align} onChange={(event) => setValue("align", event.target.value)}>
                    <option value="left">ชิดซ้าย</option>
                    <option value="right">ชิดขวา</option>
                  </Select>
                </Field>
                <ToggleField disabled={busy} label="ซ่อนชื่อ/แพลตฟอร์ม (Compact mode)" checked={draft.compactMode} onChange={(value) => setValue("compactMode", value)} />
                <ToggleField disabled={busy} label="แสดงชื่อและข้อความในบรรทัดเดียว" checked={draft.inlineMessage} onChange={(value) => setValue("inlineMessage", value)} />
                <ToggleField disabled={busy} label="แสดงข้อความรอแชท" checked={draft.showEmptyState} onChange={(value) => setValue("showEmptyState", value)} />
              </div>
            </SettingsSection>

            <SettingsSection title="การแสดงข้อมูล (Visibility)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ToggleField disabled={busy} label="แสดง Avatar" checked={draft.showAvatar} onChange={(value) => setValue("showAvatar", value)} />
                <ToggleField disabled={busy} label="แสดงชื่อผู้ส่ง" checked={draft.showName} onChange={(value) => setValue("showName", value)} />
                {draft.showName && (
                  <RangeField disabled={busy} label="จำกัดความยาวชื่อ (0=ไม่จำกัด)" min={0} max={30} step={1} value={draft.maxNameLength} onChange={(value) => setValue("maxNameLength", value)} />
                )}
                <ToggleField disabled={busy} label="แสดงโลโก้แพลตฟอร์ม" checked={draft.showPlatformLogo} onChange={(value) => setValue("showPlatformLogo", value)} />
                <ToggleField disabled={busy} label="แสดง User Badges" checked={draft.showBadges} onChange={(value) => setValue("showBadges", value)} />
                {draft.showBadges && (
                  <Field label="ตำแหน่ง Badge">
                    <Select disabled={busy} value={draft.badgesPosition} onChange={(event) => setValue("badgesPosition", event.target.value)}>
                      <option value="after_name">หลังชื่อผู้ใช้</option>
                      <option value="before_name">หน้าชื่อผู้ใช้</option>
                    </Select>
                  </Field>
                )}
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === "typography" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SettingsSection title="รูปแบบอักษร (Font Styles)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FontSettings 
                  disabled={busy} 
                  family={draft.nameFontFamily || draft.fontFamily} 
                  weight={draft.nameFontWeight} 
                  onFamilyChange={(value) => setValue("nameFontFamily", value)} 
                  onWeightChange={(value) => setValue("nameFontWeight", value)} 
                  labelPrefix="[ชื่อ] "
                />
                <RangeField disabled={busy} label="[ชื่อ] ขนาดตัวอักษร" min={10} max={28} step={1} value={draft.nameFontSize} onChange={(value) => setValue("nameFontSize", value)} />
                
                <div className="col-span-full h-px bg-border-base my-2" />
                
                <FontSettings 
                  disabled={busy} 
                  family={draft.fontFamily} 
                  weight={draft.fontWeight} 
                  onFamilyChange={(value) => setValue("fontFamily", value)} 
                  onWeightChange={(value) => setValue("fontWeight", value)} 
                  labelPrefix="[ข้อความ] "
                />
                <RangeField disabled={busy} label="[ข้อความ] ขนาดตัวอักษร" min={10} max={36} step={1} value={draft.fontSize} onChange={(value) => setValue("fontSize", value)} />
              </div>
            </SettingsSection>

            <SettingsSection title="ขอบและเงา (Stroke & Shadow)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="col-span-full font-semibold text-primary">การตั้งค่าชื่อผู้ส่ง</div>
                <RangeField disabled={busy} label="[ชื่อ] ความหนาขอบอักษร" min={0} max={10} step={1} value={draft.nameTextStrokeWidth} onChange={(value) => setValue("nameTextStrokeWidth", value)} />
                {draft.nameTextStrokeWidth > 0 && (
                  <ColorField disabled={busy} label="[ชื่อ] สีขอบอักษร" value={draft.nameTextStrokeColor} onChange={(value) => setValue("nameTextStrokeColor", value)} />
                )}
                
                <div className="col-span-full mt-2">
                  <ToggleField disabled={busy} label="[ชื่อ] เงาตัวอักษร" checked={draft.nameTextShadow} onChange={(value) => setValue("nameTextShadow", value)} />
                </div>
                {draft.nameTextShadow && (
                  <>
                    <ColorField disabled={busy} label="[ชื่อ] สีเงา" value={draft.nameTextShadowColor} onChange={(value) => setValue("nameTextShadowColor", value)} />
                    <RangeField disabled={busy} label="[ชื่อ] ความโปร่งใสเงา" min={0} max={1} step={0.05} value={draft.nameTextShadowOpacity} onChange={(value) => setValue("nameTextShadowOpacity", value)} />
                    <RangeField disabled={busy} label="[ชื่อ] แกน X (แนวนอน)" min={-20} max={20} step={1} value={draft.nameTextShadowX} onChange={(value) => setValue("nameTextShadowX", value)} />
                    <RangeField disabled={busy} label="[ชื่อ] แกน Y (แนวตั้ง)" min={-20} max={20} step={1} value={draft.nameTextShadowY} onChange={(value) => setValue("nameTextShadowY", value)} />
                    <RangeField disabled={busy} label="[ชื่อ] ความเบลอ" min={0} max={20} step={1} value={draft.nameTextShadowBlur} onChange={(value) => setValue("nameTextShadowBlur", value)} />
                  </>
                )}

                <div className="col-span-full mt-4 h-px bg-border-base" />
                <div className="col-span-full font-semibold text-primary">การตั้งค่าข้อความแชท</div>
                
                <RangeField disabled={busy} label="[ข้อความ] ความหนาขอบอักษร" min={0} max={10} step={1} value={draft.textStrokeWidth} onChange={(value) => setValue("textStrokeWidth", value)} />
                {draft.textStrokeWidth > 0 && (
                  <ColorField disabled={busy} label="[ข้อความ] สีขอบอักษร" value={draft.textStrokeColor} onChange={(value) => setValue("textStrokeColor", value)} />
                )}

                <div className="col-span-full mt-2">
                  <ToggleField disabled={busy} label="[ข้อความ] เงาตัวอักษร" checked={draft.textShadow} onChange={(value) => setValue("textShadow", value)} />
                </div>
                {draft.textShadow && (
                  <>
                    <ColorField disabled={busy} label="[ข้อความ] สีเงา" value={draft.textShadowColor} onChange={(value) => setValue("textShadowColor", value)} />
                    <RangeField disabled={busy} label="[ข้อความ] ความโปร่งใสเงา" min={0} max={1} step={0.05} value={draft.textShadowOpacity} onChange={(value) => setValue("textShadowOpacity", value)} />
                    <RangeField disabled={busy} label="[ข้อความ] แกน X (แนวนอน)" min={-20} max={20} step={1} value={draft.textShadowX} onChange={(value) => setValue("textShadowX", value)} />
                    <RangeField disabled={busy} label="[ข้อความ] แกน Y (แนวตั้ง)" min={-20} max={20} step={1} value={draft.textShadowY} onChange={(value) => setValue("textShadowY", value)} />
                    <RangeField disabled={busy} label="[ข้อความ] ความเบลอ" min={0} max={20} step={1} value={draft.textShadowBlur} onChange={(value) => setValue("textShadowBlur", value)} />
                  </>
                )}
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === "bubble" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SettingsSection title="ขนาดและระยะห่าง (Sizing & Spacing)">
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                <RangeField disabled={busy} label="ระยะห่างระหว่างแชท" min={0} max={28} step={1} value={draft.gap} onChange={(value) => setValue("gap", value)} />
                <RangeField disabled={busy} label="Padding ขอบนอก" min={0} max={40} step={1} value={draft.padding} onChange={(value) => setValue("padding", value)} />
                <RangeField disabled={busy} label="มุมโค้งกล่อง (Border Radius)" min={0} max={32} step={1} value={draft.borderRadius} onChange={(value) => setValue("borderRadius", value)} />
                <RangeField disabled={busy} label="Padding ซ้ายขวา (ในกล่อง)" min={4} max={32} step={1} value={draft.messagePaddingX} onChange={(value) => setValue("messagePaddingX", value)} />
                <RangeField disabled={busy} label="Padding บนล่าง (ในกล่อง)" min={2} max={24} step={1} value={draft.messagePaddingY} onChange={(value) => setValue("messagePaddingY", value)} />
              </div>
            </SettingsSection>

            <SettingsSection title="สีและขอบ (Background & Border)">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="col-span-full font-semibold text-primary">พื้นหลังรวมหน้าต่าง</div>
                <ColorField disabled={busy} label="พื้นหลังรวม" value={draft.backgroundColor} onChange={(value) => setValue("backgroundColor", value)} />
                <RangeField disabled={busy} label="ความโปร่งใสพื้นหลังรวม" min={0} max={1} step={0.05} value={draft.backgroundOpacity} onChange={(value) => setValue("backgroundOpacity", value)} />
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="ใช้ไล่สี (Gradient) พื้นหลังรวม" checked={draft.backgroundGradient} onChange={(value) => setValue("backgroundGradient", value)} />
                </div>
                {draft.backgroundGradient && (
                  <>
                    <ColorField disabled={busy} label="สีที่สอง (Gradient)" value={draft.backgroundGradientColor} onChange={(value) => setValue("backgroundGradientColor", value)} />
                    <RangeField disabled={busy} label="องศา Gradient" min={0} max={360} step={1} value={draft.backgroundGradientAngle} onChange={(value) => setValue("backgroundGradientAngle", value)} />
                  </>
                )}

                <div className="col-span-full mt-4 h-px bg-border-base" />
                <div className="col-span-full font-semibold text-primary">กล่องข้อความ</div>
                <ColorField disabled={busy} label="พื้นหลังกล่องแชท" value={draft.bubbleColor} onChange={(value) => setValue("bubbleColor", value)} />
                <RangeField disabled={busy} label="ความโปร่งใสกล่องแชท" min={0} max={1} step={0.05} value={draft.bubbleOpacity} onChange={(value) => setValue("bubbleOpacity", value)} />
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="ใช้ไล่สี (Gradient) กล่องแชท" checked={draft.bubbleGradient} onChange={(value) => setValue("bubbleGradient", value)} />
                </div>
                {draft.bubbleGradient && (
                  <>
                    <ColorField disabled={busy} label="สีที่สอง (Gradient)" value={draft.bubbleGradientColor} onChange={(value) => setValue("bubbleGradientColor", value)} />
                    <RangeField disabled={busy} label="องศา Gradient" min={0} max={360} step={1} value={draft.bubbleGradientAngle} onChange={(value) => setValue("bubbleGradientAngle", value)} />
                  </>
                )}

                <div className="col-span-full mt-4 h-px bg-border-base" />
                <div className="col-span-full font-semibold text-primary">ขอบกล่องข้อความ</div>
                <ColorField disabled={busy} label="สีขอบกล่อง" value={draft.borderColor} onChange={(value) => setValue("borderColor", value)} />
                <RangeField disabled={busy} label="ความโปร่งใสขอบกล่อง" min={0} max={1} step={0.05} value={draft.borderOpacity} onChange={(value) => setValue("borderOpacity", value)} />
                <RangeField disabled={busy} label="ความหนาขอบกล่อง" min={0} max={10} step={1} value={draft.borderWidth} onChange={(value) => setValue("borderWidth", value)} />
              </div>
            </SettingsSection>

            <SettingsSection title="เงากล่องแชท (Drop Shadow)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="เปิดใช้เงากล่องแชท" checked={draft.bubbleDropShadow} onChange={(value) => setValue("bubbleDropShadow", value)} />
                </div>
                {draft.bubbleDropShadow && (
                  <>
                    <ColorField disabled={busy} label="สีเงา" value={draft.bubbleShadowColor} onChange={(value) => setValue("bubbleShadowColor", value)} />
                    <RangeField disabled={busy} label="ความโปร่งใสเงา" min={0} max={1} step={0.05} value={draft.bubbleShadowOpacity} onChange={(value) => setValue("bubbleShadowOpacity", value)} />
                    <RangeField disabled={busy} label="แกน X (แนวนอน)" min={-50} max={50} step={1} value={draft.bubbleShadowX} onChange={(value) => setValue("bubbleShadowX", value)} />
                    <RangeField disabled={busy} label="แกน Y (แนวตั้ง)" min={-50} max={50} step={1} value={draft.bubbleShadowY} onChange={(value) => setValue("bubbleShadowY", value)} />
                    <RangeField disabled={busy} label="ความเบลอ" min={0} max={50} step={1} value={draft.bubbleShadowBlur} onChange={(value) => setValue("bubbleShadowBlur", value)} />
                  </>
                )}
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === "namebadge" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SettingsSection title="การแยกกรอบชื่อ (Separate Badge)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="แยกกรอบชื่อผู้ส่งออกจากข้อความ" checked={draft.separateBubbles} onChange={(value) => setValue("separateBubbles", value)} />
                </div>
                <RangeField
                  disabled={busy}
                  label="ระยะห่างชื่อผู้ส่งกับข้อความ"
                  max={20}
                  min={0}
                  onChange={(value) => setValue("nameMessageSpacing", value)}
                  step={1}
                  value={draft.nameMessageSpacing}
                />
              </div>
            </SettingsSection>

            {draft.separateBubbles && (
              <>
                <SettingsSection title="รูปแบบป้ายชื่อ (Badge Style)">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <ColorField disabled={busy} label="สีพื้นหลังกรอบชื่อ" value={draft.nameBubbleColor} onChange={(value) => setValue("nameBubbleColor", value)} />
                    <RangeField disabled={busy} label="ความโปร่งใสพื้นหลัง" min={0} max={1} step={0.05} value={draft.nameBubbleOpacity} onChange={(value) => setValue("nameBubbleOpacity", value)} />
                    <RangeField disabled={busy} label="ความโค้งมนกรอบชื่อ" min={0} max={32} step={1} value={draft.nameBorderRadius} onChange={(value) => setValue("nameBorderRadius", value)} />
                    
                    <div className="col-span-full">
                      <ToggleField disabled={busy} label="ใช้ไล่สี (Gradient) กรอบชื่อ" checked={draft.nameBubbleGradient} onChange={(value) => setValue("nameBubbleGradient", value)} />
                    </div>
                    {draft.nameBubbleGradient && (
                      <>
                        <ColorField disabled={busy} label="สีที่สอง (Gradient)" value={draft.nameBubbleGradientColor} onChange={(value) => setValue("nameBubbleGradientColor", value)} />
                        <RangeField disabled={busy} label="องศา Gradient" min={0} max={360} step={1} value={draft.nameBubbleGradientAngle} onChange={(value) => setValue("nameBubbleGradientAngle", value)} />
                      </>
                    )}

                    <div className="col-span-full mt-4 h-px bg-border-base" />
                    
                    <ColorField disabled={busy} label="สีขอบกรอบชื่อ" value={draft.nameBorderColor} onChange={(value) => setValue("nameBorderColor", value)} />
                    <RangeField disabled={busy} label="ความหนาขอบกรอบชื่อ" min={0} max={20} step={1} value={draft.nameBorderWidth} onChange={(value) => setValue("nameBorderWidth", value)} />
                    <RangeField disabled={busy} label="ความโปร่งใสขอบชื่อ" min={0} max={1} step={0.05} value={draft.nameBorderOpacity} onChange={(value) => setValue("nameBorderOpacity", value)} />
                  </div>
                </SettingsSection>

                <SettingsSection title="เงาป้ายชื่อ (Badge Shadow)">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="col-span-full">
                      <ToggleField disabled={busy} label="เปิดใช้เงากรอบชื่อ" checked={draft.nameBubbleDropShadow} onChange={(value) => setValue("nameBubbleDropShadow", value)} />
                    </div>
                    {draft.nameBubbleDropShadow && (
                      <>
                        <ColorField disabled={busy} label="สีเงา" value={draft.nameBubbleShadowColor} onChange={(value) => setValue("nameBubbleShadowColor", value)} />
                        <RangeField disabled={busy} label="ความโปร่งใสเงา" min={0} max={1} step={0.05} value={draft.nameBubbleShadowOpacity} onChange={(value) => setValue("nameBubbleShadowOpacity", value)} />
                        <RangeField disabled={busy} label="แกน X (แนวนอน)" min={-50} max={50} step={1} value={draft.nameBubbleShadowX} onChange={(value) => setValue("nameBubbleShadowX", value)} />
                        <RangeField disabled={busy} label="แกน Y (แนวตั้ง)" min={-50} max={50} step={1} value={draft.nameBubbleShadowY} onChange={(value) => setValue("nameBubbleShadowY", value)} />
                        <RangeField disabled={busy} label="ความเบลอ" min={0} max={50} step={1} value={draft.nameBubbleShadowBlur} onChange={(value) => setValue("nameBubbleShadowBlur", value)} />
                      </>
                    )}
                  </div>
                </SettingsSection>
              </>
            )}
          </div>
        ) : null}

        {activeTab === "textcolors" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SettingsSection title="สีข้อความแชท (Message Colors)">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <ColorField disabled={busy} label="ข้อความแชท (ทั่วไป)" value={draft.textColor} onChange={(value) => setValue("textColor", value)} />
                
                <div className="col-span-full mt-2">
                  <ToggleField disabled={busy} label="แยกสีข้อความของ สตรีมเมอร์ (Broadcaster)" checked={draft.useOwnerTextColor} onChange={(value) => setValue("useOwnerTextColor", value)} />
                </div>
                {draft.useOwnerTextColor && (
                  <ColorField disabled={busy} label="สีข้อความ สตรีมเมอร์" value={draft.ownerTextColor} onChange={(value) => setValue("ownerTextColor", value)} />
                )}
                
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="แยกสีข้อความของ แอดมิน (Moderator)" checked={draft.useModTextColor} onChange={(value) => setValue("useModTextColor", value)} />
                </div>
                {draft.useModTextColor && (
                  <ColorField disabled={busy} label="สีข้อความ แอดมิน" value={draft.modTextColor} onChange={(value) => setValue("modTextColor", value)} />
                )}
                
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="แยกสีข้อความของ สมาชิก (Member/Sub)" checked={draft.useMemberTextColor} onChange={(value) => setValue("useMemberTextColor", value)} />
                </div>
                {draft.useMemberTextColor && (
                  <ColorField disabled={busy} label="สีข้อความ สมาชิก" value={draft.memberTextColor} onChange={(value) => setValue("memberTextColor", value)} />
                )}
              </div>
            </SettingsSection>

            <SettingsSection title="สีชื่อผู้ส่ง (Name Colors)">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="สุ่มสีชื่อผู้ส่งทั่วไป" checked={draft.randomNameColor} onChange={(value) => setValue("randomNameColor", value)} />
                </div>

                <div className="col-span-full mt-2 h-px bg-border-base" />
                <div className="col-span-full font-semibold text-primary">แยกสีตามตำแหน่ง</div>
                
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="สตรีมเมอร์ (Broadcaster)" checked={draft.useOwnerNameColor} onChange={(value) => setValue("useOwnerNameColor", value)} />
                </div>
                {draft.useOwnerNameColor && (
                  <ColorField disabled={busy} label="สีชื่อ สตรีมเมอร์" value={draft.ownerNameColor} onChange={(value) => setValue("ownerNameColor", value)} />
                )}
                
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="แอดมิน (Moderator)" checked={draft.useModNameColor} onChange={(value) => setValue("useModNameColor", value)} />
                </div>
                {draft.useModNameColor && (
                  <ColorField disabled={busy} label="สีชื่อ แอดมิน" value={draft.modNameColor} onChange={(value) => setValue("modNameColor", value)} />
                )}
                
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="สมาชิก (Member/Sub)" checked={draft.useMemberNameColor} onChange={(value) => setValue("useMemberNameColor", value)} />
                </div>
                {draft.useMemberNameColor && (
                  <ColorField disabled={busy} label="สีชื่อ สมาชิก" value={draft.memberNameColor} onChange={(value) => setValue("memberNameColor", value)} />
                )}

                <div className="col-span-full mt-2 h-px bg-border-base" />
                <div className="col-span-full font-semibold text-primary">สีพื้นฐานตามแพลตฟอร์ม</div>
                <ColorField disabled={busy} label="ชื่อ TikTok" value={draft.tiktokNameColor} onChange={(value) => setValue("tiktokNameColor", value)} />
                <ColorField disabled={busy} label="ชื่อ YouTube" value={draft.youtubeNameColor} onChange={(value) => setValue("youtubeNameColor", value)} />
                <ColorField disabled={busy} label="ชื่อ Twitch" value={draft.twitchNameColor} onChange={(value) => setValue("twitchNameColor", value)} />
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === "icons" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-5">
            <SettingsSection title="รูปโปรไฟล์ (Avatar)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="รูปแบบ Avatar">
                  <Select disabled={busy} value={draft.avatarShape} onChange={(event) => setValue("avatarShape", event.target.value)}>
                    <option value="circle">วงกลม</option>
                    <option value="rounded">ขอบมน</option>
                    <option value="square">สี่เหลี่ยม</option>
                  </Select>
                </Field>
                <RangeField disabled={busy} label="ขนาด Avatar" min={18} max={80} step={1} value={draft.avatarSize} onChange={(value) => setValue("avatarSize", value)} />
                <RangeField disabled={busy} label="ความหนาขอบ" min={0} max={8} step={1} value={draft.avatarBorderWidth} onChange={(value) => setValue("avatarBorderWidth", value)} />
                {draft.avatarBorderWidth > 0 && (
                  <>
                    <ColorField disabled={busy} label="สีขอบ" value={draft.avatarBorderColor} onChange={(value) => setValue("avatarBorderColor", value)} />
                    <RangeField disabled={busy} label="ความโปร่งใสขอบ" min={0} max={1} step={0.05} value={draft.avatarBorderOpacity} onChange={(value) => setValue("avatarBorderOpacity", value)} />
                  </>
                )}
              </div>
            </SettingsSection>

            <SettingsSection title="โลโก้แพลตฟอร์ม (Platform Logo)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <RangeField disabled={busy} label="ขนาดโลโก้" min={10} max={40} step={1} value={draft.platformLogoSize} onChange={(value) => setValue("platformLogoSize", value)} />
                <RangeField disabled={busy} label="ความหนาขอบ" min={0} max={8} step={1} value={draft.platformLogoBorderWidth} onChange={(value) => setValue("platformLogoBorderWidth", value)} />
                {draft.platformLogoBorderWidth > 0 && (
                  <>
                    <ColorField disabled={busy} label="สีขอบ" value={draft.platformLogoBorderColor} onChange={(value) => setValue("platformLogoBorderColor", value)} />
                    <RangeField disabled={busy} label="ความโปร่งใสขอบ" min={0} max={1} step={0.05} value={draft.platformLogoBorderOpacity} onChange={(value) => setValue("platformLogoBorderOpacity", value)} />
                  </>
                )}
              </div>
            </SettingsSection>

            <SettingsSection title="ป้ายสถานะ (Badges)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <RangeField disabled={busy} label="ขนาดป้าย" min={10} max={40} step={1} value={draft.badgeSize} onChange={(value) => setValue("badgeSize", value)} />
                <RangeField disabled={busy} label="ความหนาขอบ" min={0} max={8} step={1} value={draft.badgeBorderWidth} onChange={(value) => setValue("badgeBorderWidth", value)} />
                {draft.badgeBorderWidth > 0 && (
                  <>
                    <ColorField disabled={busy} label="สีขอบ" value={draft.badgeBorderColor} onChange={(value) => setValue("badgeBorderColor", value)} />
                    <RangeField disabled={busy} label="ความโปร่งใสขอบ" min={0} max={1} step={0.05} value={draft.badgeBorderOpacity} onChange={(value) => setValue("badgeBorderOpacity", value)} />
                  </>
                )}
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === "animations" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SettingsSection title="แอนิเมชัน (Animations)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Animation ขาเข้า">
                  <Select disabled={busy} value={draft.animationType} onChange={(event) => setValue("animationType", event.target.value)}>
                    <option value="none">ไม่มี</option>
                    <option value="fade">Fade in</option>
                    <option value="slide-up">Slide Up</option>
                    <option value="slide-left">Slide Left</option>
                    <option value="slide-right">Slide Right</option>
                    <option value="pop">Pop (เด้ง)</option>
                  </Select>
                </Field>
                <Field label="Animation ขาออก">
                  <Select disabled={busy} value={draft.exitAnimationType} onChange={(event) => setValue("exitAnimationType", event.target.value)}>
                    <option value="none">ไม่มี</option>
                    <option value="fade">Fade out</option>
                    <option value="slide-up">Slide Up</option>
                    <option value="slide-left">Slide Left</option>
                    <option value="slide-right">Slide Right</option>
                    <option value="pop">Pop (หด)</option>
                  </Select>
                </Field>
                <RangeField disabled={busy} label="ความเร็วแอนิเมชัน (วินาที)" min={0.1} max={2.0} step={0.1} value={draft.animationDuration} onChange={(value) => setValue("animationDuration", value)} />
                <Field label="ซ่อนข้อความอัตโนมัติ">
                  <Select disabled={busy} value={String(draft.hideAfter)} onChange={(event) => setValue("hideAfter", Number(event.target.value))}>
                    <option value="0">ไม่ซ่อน</option>
                    <option value="5">5 วินาที</option>
                    <option value="10">10 วินาที</option>
                    <option value="15">15 วินาที</option>
                    <option value="30">30 วินาที</option>
                    <option value="60">60 วินาที</option>
                  </Select>
                </Field>
              </div>
            </SettingsSection>
          </div>
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
      className={`relative border-2 px-5 py-2.5 text-sm font-bold uppercase tracking-widest transition-all duration-200 ${
        active 
          ? "border-primary bg-primary text-black translate-x-0.5 translate-y-0.5 shadow-none" 
          : "border-border-base bg-surface-base text-ink-subtle hover:bg-surface-dark hover:text-white shadow-brutal-sm hover:-translate-y-0.5 hover:shadow-brutal-md"
      }`}
    >
      {children}
    </button>
  );
}

function SettingsSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="relative mb-8 mt-4 border-2 border-border-base bg-surface-base/50 p-6 pt-7 shadow-brutal-sm transition-all hover:shadow-brutal-md">
      <h3 className="absolute -top-3.5 left-4 inline-block border-2 border-primary bg-primary px-3 py-0.5 text-sm font-black uppercase tracking-widest text-black">
        {title}
      </h3>
      <div>
        {children}
      </div>
    </section>
  );
}

function ToggleField({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: (value: boolean) => void }) {
  const isChecked = !!checked;
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-3 border-2 px-4 py-3 text-sm font-bold transition-all duration-200 ${
      isChecked 
        ? "border-primary bg-primary/10 text-primary shadow-brutal-sm" 
        : "border-border-base bg-surface-base text-white hover:border-ink-faint hover:bg-surface-dark"
    }`}>
      <span>{label}</span>
      <div className={`relative flex h-7 w-14 shrink-0 items-center border-2 transition-colors duration-200 ${
        isChecked ? "border-primary bg-primary" : "border-ink-base bg-surface-dark"
      }`}>
        <div className={`h-4 w-4 border-2 transition-transform duration-200 ${
          isChecked ? "translate-x-[32px] border-black bg-white" : "translate-x-[2px] border-transparent bg-ink-muted"
        }`} />
      </div>
      <input checked={isChecked} className="sr-only" disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function ColorField({ disabled, label, onChange, value }: { disabled: boolean; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <Field label={label}>
      <div className="group flex min-w-0 items-center gap-3">
        <div className="relative h-12 w-12 shrink-0 border-2 border-border-base shadow-brutal-sm transition-transform duration-200 group-hover:scale-110 group-hover:shadow-brutal-md">
          <input
            className="absolute -inset-2 h-16 w-16 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            type="color"
            value={value || "#000000"}
          />
          <div className="pointer-events-none h-full w-full border border-black/20" style={{ backgroundColor: value || "#000000" }} />
        </div>
        <Input className="min-w-0 font-mono text-center uppercase tracking-widest transition-colors group-hover:border-primary" disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value || "#000000"} />
      </div>
    </Field>
  );
}

function RangeField({ disabled, label, max, min, onChange, step, value }: { disabled: boolean; label: string; max: number; min: number; onChange: (value: number) => void; step: number; value: number }) {
  return (
    <Field label={<span className="flex justify-between items-end"><span>{label}</span><span className="font-mono text-primary font-bold">{value ?? 0}</span></span>}>
      <input
        className="mt-1 h-3 w-full cursor-pointer appearance-none border-2 border-border-base bg-surface-dark accent-primary disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value ?? 0}
      />
    </Field>
  );
}

function ViewerCountWidgetSettings({
  busy,
  draft,
  isDirty,
  onDraftChange,
  onSave
}: {
  busy: boolean;
  draft: Record<string, any>;
  isDirty: boolean;
  onDraftChange: (draft: Record<string, any>) => void;
  onSave: () => Promise<void>;
}) {
  function setValue(key: string, value: any) {
    onDraftChange({ ...draft, [key]: value });
  }

  const handleSaveAndLeave = async () => {
    try {
      await onSave();
      return true;
    } catch {
      return false;
    }
  };

  const { UnsavedChangesModal } = useUnsavedChangesWarning(isDirty, handleSaveAndLeave);

  return (
    <ResourceCard>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-semibold text-white">ปรับแต่ง Viewer Count Widget</p>
          <p className="mt-1 text-xs font-medium text-ink-subtle">ตั้งค่าป้ายกำกับและการแสดงผลของจำนวนคนดู</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            disabled={busy} 
            onClick={() => void onSave()} 
            type="button"
            className={isDirty ? "bg-rose-600 text-white hover:bg-rose-500 border-rose-500 animate-pulse shadow-rose-900/20" : ""}
          >
            บันทึก
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <SettingsSection title="ทั่วไป">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="ช่องทางผู้ชมที่ต้องการแสดง">
              <Select disabled={busy} value={draft.platforms} onChange={(event) => setValue("platforms", event.target.value)}>
                <option value="all">แสดงทั้งหมด (รวมยอดทุกแพลตฟอร์ม)</option>
                <option value="youtube">แสดงเฉพาะ YouTube</option>
                <option value="tiktok">แสดงเฉพาะ TikTok</option>
                <option value="twitch">แสดงเฉพาะ Twitch</option>
              </Select>
            </Field>
            <ToggleField disabled={busy} label="แสดงจุดไฟกระพริบ (Ping Dot)" checked={draft.showPingDot} onChange={(value) => setValue("showPingDot", value)} />
            <ToggleField disabled={busy} label="แสดงเงาข้อความ (Text Shadow)" checked={draft.textShadow} onChange={(value) => setValue("textShadow", value)} />
          </div>
        </SettingsSection>
        
        <SettingsSection title="ขนาดและตัวอักษร">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RangeField disabled={busy} label="ขนาดตัวอักษร" min={12} max={72} step={1} value={draft.fontSize} onChange={(value) => setValue("fontSize", value)} />
            <RangeField disabled={busy} label="ขนาดไอคอน" min={12} max={72} step={1} value={draft.iconSize} onChange={(value) => setValue("iconSize", value)} />
            <div className="col-span-full sm:col-span-2 lg:col-span-3">
              <FontSettings 
                disabled={busy} 
                family={draft.fontFamily} 
                weight={draft.fontWeight} 
                onFamilyChange={(f) => setValue("fontFamily", f)} 
                onWeightChange={(w) => setValue("fontWeight", w)} 
              />
            </div>
          </div>
        </SettingsSection>
        
        <SettingsSection title="รูปแบบและสีสัน">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ToggleField disabled={busy} label="แยกสีตัวเลขตามแพลตฟอร์ม" checked={draft.useSeparateColors} onChange={(value) => setValue("useSeparateColors", value)} />
            {!draft.useSeparateColors ? (
              <ColorField disabled={busy} label="สีตัวเลข (รวม)" value={draft.textColor} onChange={(value) => setValue("textColor", value)} />
            ) : (
              <>
                <ColorField disabled={busy} label="สีตัวเลข YouTube" value={draft.youtubeColor} onChange={(value) => setValue("youtubeColor", value)} />
                <ColorField disabled={busy} label="สีตัวเลข TikTok" value={draft.tiktokColor} onChange={(value) => setValue("tiktokColor", value)} />
                <ColorField disabled={busy} label="สีตัวเลข Twitch" value={draft.twitchColor} onChange={(value) => setValue("twitchColor", value)} />
              </>
            )}
            <ToggleField disabled={busy} label="แสดงพื้นหลัง" checked={draft.showBackground} onChange={(value) => setValue("showBackground", value)} />
            
            {draft.showBackground && (
              <>
                <ColorField disabled={busy} label="สีพื้นหลัง" value={draft.backgroundColor} onChange={(value) => setValue("backgroundColor", value)} />
                <RangeField disabled={busy} label="ความโปร่งใสพื้นหลัง" min={0} max={1} step={0.05} value={draft.backgroundOpacity} onChange={(value) => setValue("backgroundOpacity", value)} />
                <RangeField disabled={busy} label="ความโค้งมุม (Border Radius)" min={0} max={40} step={1} value={draft.borderRadius} onChange={(value) => setValue("borderRadius", value)} />
              </>
            )}
          </div>
        </SettingsSection>
        
        <SettingsSection title="การจัดวาง">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RangeField disabled={busy} label="ระยะห่างระหว่างรายการ (Gap)" min={0} max={40} step={1} value={draft.gap} onChange={(value) => setValue("gap", value)} />
            {draft.showBackground && (
              <>
                <RangeField disabled={busy} label="ระยะห่างขอบแนวนอน (Padding X)" min={0} max={40} step={1} value={draft.paddingX} onChange={(value) => setValue("paddingX", value)} />
                <RangeField disabled={busy} label="ระยะห่างขอบแนวตั้ง (Padding Y)" min={0} max={40} step={1} value={draft.paddingY} onChange={(value) => setValue("paddingY", value)} />
              </>
            )}
          </div>
        </SettingsSection>
      </div>
      {UnsavedChangesModal}
    </ResourceCard>
  );
}

function FontSettings({ disabled, family, weight, onFamilyChange, onWeightChange, labelPrefix = "" }: { disabled: boolean; family: string; weight: string; onFamilyChange: (f: string) => void; onWeightChange: (w: string) => void; labelPrefix?: string; }) {
  const [localFonts, setLocalFonts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hasLoadedFonts = useRef(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    async function checkPermission() {
      try {
        // @ts-ignore
        const status = await navigator.permissions.query({ name: "local-fonts" });
        if (status.state === "granted") {
          void loadLocalFonts(true);
        }
      } catch (e) {}
    }
    checkPermission();
  }, []);

  async function loadLocalFonts(silent = false) {
    if (hasLoadedFonts.current) return;
    if (!("queryLocalFonts" in window)) {
      if (!silent) setError("เบราว์เซอร์ไม่รองรับ (ต้องใช้ Chrome/Edge รุ่นใหม่)");
      return;
    }
    try {
      if (!silent) setLoading(true);
      setError("");
      // @ts-ignore
      const fonts = await window.queryLocalFonts();
      setLocalFonts(fonts);
      hasLoadedFonts.current = true;
    } catch (err) {
      if (!silent) setError("ไม่อนุญาตหรือโหลดฟอนต์ไม่สำเร็จ");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const uniqueFamilies = Array.from(new Set(localFonts.map(f => f.family as string))).sort();
  const currentFamilyFonts = localFonts.filter(f => f.family === family);
  
  const getWeightFromStyle = (style: string) => {
    const s = style.toLowerCase();
    if (s.includes("thin") || s.includes("hairline")) return "100";
    if (s.includes("extra light") || s.includes("ultra light")) return "200";
    if (s.includes("light")) return "300";
    if (s.includes("medium")) return "500";
    if (s.includes("semi") || s.includes("demi")) return "600";
    if (s.includes("extra bold") || s.includes("ultra bold")) return "800";
    if (s.includes("black") || s.includes("heavy")) return "900";
    if (s.includes("bold")) return "700";
    return "400";
  };

  const availableWeights = currentFamilyFonts.length > 0 
    ? Array.from(new Set(currentFamilyFonts.map(f => getWeightFromStyle(f.style)))).sort() 
    : [];

  // If a user has a loaded font, standard strings like "normal" or "bold" map to 400 and 700
  const normalizedWeight = weight === "normal" ? "400" : weight === "medium" ? "500" : weight === "bold" ? "700" : weight === "black" ? "900" : weight;
  
  // If reverting to system font, map numeric back to standard strings
  const fallbackWeight = weight === "400" ? "normal" : weight === "500" ? "medium" : weight === "700" ? "bold" : weight === "900" ? "black" : (["normal", "medium", "bold", "black"].includes(weight) ? weight : "normal");

  const options = [
    { label: "System (ค่าเริ่มต้น)", value: "system" },
    { label: "Monospace", value: "mono" },
    ...uniqueFamilies.map(f => ({ label: f, value: f }))
  ];
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()) || o.value.toLowerCase().includes(search.toLowerCase()));
  const displayValue = isOpen ? search : (options.find(o => o.value === family)?.label || family);

  return (
    <>
      <Field label={`${labelPrefix}ฟอนต์`}>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2" ref={wrapperRef}>
            <div className="relative w-full">
              <Input 
                disabled={disabled} 
                value={displayValue} 
                onChange={(e) => {
                  setSearch(e.target.value);
                  setIsOpen(true);
                }}
                onFocus={() => {
                  setSearch("");
                  setIsOpen(true);
                  if (!hasLoadedFonts.current) {
                    void loadLocalFonts();
                  }
                }}
                placeholder="ค้นหาฟอนต์..."
                className="pr-8"
              />
              <div className="absolute right-3 top-3 pointer-events-none text-ink-subtle text-xs">▼</div>
              {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-surface-card border-2 border-border-base shadow-xl max-h-60 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <div className="p-3 text-sm text-ink-faint text-center">ไม่พบฟอนต์</div>
                  ) : (
                    filtered.map(opt => (
                      <div 
                        key={opt.value}
                        className={`px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-white ${opt.value === family ? "bg-primary/20 text-primary" : "text-white"}`}
                        onClick={() => {
                          onFamilyChange(opt.value);
                          setIsOpen(false);
                          setSearch("");
                        }}
                      >
                        {opt.label}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          {error ? <p className="text-xs text-rose-400">{error}</p> : null}
        </div>
      </Field>

      <Field label={`${labelPrefix}ความหนา`}>
        <Select disabled={disabled} value={currentFamilyFonts.length > 0 ? normalizedWeight : fallbackWeight} onChange={(e) => onWeightChange(e.target.value)}>
          {currentFamilyFonts.length === 0 ? (
            <>
              <option value="normal">ปกติ (Normal)</option>
              <option value="medium">กลาง (Medium)</option>
              <option value="bold">หนา (Bold)</option>
              <option value="black">หนามาก (Black)</option>
            </>
          ) : (
            <>
              {availableWeights.includes("100") && <option value="100">Thin (100)</option>}
              {availableWeights.includes("200") && <option value="200">Extra Light (200)</option>}
              {availableWeights.includes("300") && <option value="300">Light (300)</option>}
              {availableWeights.includes("400") && <option value="400">Regular (400)</option>}
              {availableWeights.includes("500") && <option value="500">Medium (500)</option>}
              {availableWeights.includes("600") && <option value="600">Semi Bold (600)</option>}
              {availableWeights.includes("700") && <option value="700">Bold (700)</option>}
              {availableWeights.includes("800") && <option value="800">Extra Bold (800)</option>}
              {availableWeights.includes("900") && <option value="900">Black (900)</option>}
            </>
          )}
        </Select>
      </Field>
    </>
  );
}

export default function WidgetDetailPage() {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-white">กำลังโหลดข้อมูล Widget...</div>}>
      <WidgetDetailContent />
    </Suspense>
  );
}
