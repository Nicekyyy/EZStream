"use client";

import { useEffect, useMemo, useRef, useState, memo, Fragment, type CSSProperties, type ReactNode } from "react";
import type { UnifiedChatMessage } from "@ezstream/shared";
import { TiktokIcon, YoutubeIcon, TwitchIcon } from "./icons";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "../lib/api";
import { isAudioOnlyWidgetType } from "../lib/widget-types";

export type OverlayWidget = {
  id: string;
  name: string;
  type: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  visibility: boolean;
  config: Record<string, unknown>;
  state?: { state: Record<string, unknown> };
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function choice<T extends string>(value: unknown, values: readonly T[], fallback: T) {
  return typeof value === "string" && values.includes(value as T) ? (value as T) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function color(value: unknown, fallback: string) {
  return typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fallback;
}

function resolveMediaSrc(src: string): string {
  return src.startsWith("/") ? `${API_URL}${src}` : src;
}

function fontWeightValue(value: string): number {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isNaN(numeric)) return clamp(numeric, 100, 900);
  return value === "black" ? 900 : value === "bold" ? 700 : value === "medium" ? 500 : 400;
}

function fontFamilyValue(family: string): string | undefined {
  if (!family || family === "system") return undefined;
  if (family === "mono") return "ui-monospace, SFMono-Regular, monospace";
  return `"${family}", sans-serif`;
}

function rgba(hex: string, alpha: number) {
  const normalized = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex.slice(0, 7);
  const value = Number.parseInt(normalized.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function getSmoothOutlineShadows(width: number, color: string) {
  if (width <= 0) return "";
  const shadows = [];
  for (let r = 1; r <= width; r++) {
    const steps = Math.max(8, Math.ceil(r * 2 * Math.PI));
    for (let i = 0; i < steps; i++) {
      const angle = (i * 2 * Math.PI) / steps;
      const x = (r * Math.cos(angle)).toFixed(2);
      const y = (r * Math.sin(angle)).toFixed(2);
      shadows.push(`${x}px ${y}px 0 ${color}`);
    }
  }
  if (width % 1 !== 0) {
    const steps = Math.max(8, Math.ceil(width * 2 * Math.PI));
    for (let i = 0; i < steps; i++) {
      const angle = (i * 2 * Math.PI) / steps;
      const x = (width * Math.cos(angle)).toFixed(2);
      const y = (width * Math.sin(angle)).toFixed(2);
      shadows.push(`${x}px ${y}px 0 ${color}`);
    }
  }
  return shadows.join(", ");
}

function isInlineEmojiUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return (
      /\.(?:png|webp|gif|jpe?g|svg|image|avif|heic)$/.test(path) ||
      host === "yt3.ggpht.com" ||
      host.endsWith(".ggpht.com") ||
      host.endsWith(".googleusercontent.com") ||
      host.endsWith(".googleusercontent.com.ph") ||
      host.includes("tiktokcdn") ||
      host.includes("tiktok.com") ||
      host.includes("tiktokv") ||
      host.includes("muscdn") ||
      host.includes("musical.ly") ||
      host.includes("ibytedtos") ||
      host.includes("byteoversea") ||
      host.includes("byteimg") ||
      host.includes("bytednsdoc") ||
      host.startsWith("p16-sign") ||
      host.startsWith("p19-sign") ||
      host.includes("jtvnw.net") ||
      (host.endsWith("youtube.com") && path.includes("emoji"))
    );
  } catch {
    return false;
  }
}

function cleanInlineEmojiUrl(value: string) {
  return value.replace(/[)\],.!?]+$/g, "");
}

function fallbackEmojiLabel(url: string) {
  try {
    const parsed = new URL(url);
    const lastPath = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) ?? "");
    return lastPath.replace(/\.(?:png|webp|gif|jpe?g|svg)$/i, "") || "[emoji]";
  } catch {
    return "[emoji]";
  }
}

function InlineEmojiImage({ label, src }: { label: string; src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="mx-0.5 inline text-current">{label}</span>;
  return (
    <img
      src={src}
      alt={label}
      referrerPolicy="no-referrer"
      className="mx-0.5 inline-block h-[1.35em] w-[1.35em] align-[-0.25em] object-contain"
      onError={() => setFailed(true)}
    />
  );
}

export function renderChatMessageText(message: string) {
  const parts: ReactNode[] = [];
  const tokenPattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>|https?:\/\/[^\s<>"']+/gi;
  let lastIndex = 0;

  for (const match of message.matchAll(tokenPattern)) {
    const token = match[0];
    const rawUrl = match[1] ?? token;
    const url = cleanInlineEmojiUrl(rawUrl);
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(message.slice(lastIndex, index));

    if (isInlineEmojiUrl(url)) {
      parts.push(
        <InlineEmojiImage
          key={`${url}-${index}`}
          src={url}
          label={match[1] ? "[emoji]" : fallbackEmojiLabel(url)}
        />
      );
    } else {
      parts.push(token);
    }
    lastIndex = index + token.length;
  }

  if (lastIndex < message.length) parts.push(message.slice(lastIndex));
  return parts.length ? parts : message;
}

export const WidgetRenderer = memo(function WidgetRenderer({ widget, chatMessages = [] }: { widget: OverlayWidget; chatMessages?: UnifiedChatMessage[] }) {
  const state = widget.state?.state ?? {};
  const config = widget.config ?? {};
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const style = {
    left: widget.positionX,
    top: widget.positionY,
    width: widget.width,
    height: widget.height,
    zIndex: widget.zIndex,
    display: widget.visibility ? "block" : "none"
  };

  const rawAudioSource = text(config.src) || text(config.url) || text(state.src);
  const audioSource = rawAudioSource ? resolveMediaSrc(rawAudioSource) : "";

  useEffect(() => {
    if (widget.type === "SOUND_WIDGET" && state.playing && audioRef.current) {
      audioRef.current.volume = clamp(number(config.volume, 1), 0, 1);
      audioRef.current.currentTime = 0;
      void audioRef.current.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.type, state.playing, state.lastTriggeredAt]);

  const body = useMemo(() => {
    switch (widget.type) {
      case "ALERT_WIDGET":
        return <AlertWidget widget={widget} />;
      case "TTS_WIDGET":
        return null;
      case "GOAL_WIDGET":
        return <GoalWidget widget={widget} />;
      case "EVENT_LIST_WIDGET":
        return <EventListWidget widget={widget} />;
      case "CHAT_WIDGET":
        return <ChatWidget widget={widget} chatMessages={chatMessages} />;
      case "IMAGE_WIDGET":
        return <ImageWidget widget={widget} />;
      case "SOUND_WIDGET":
        return null;
      case "TEXT_WIDGET":
        return <TextWidget widget={widget} />;
      case "VIEWER_COUNT_WIDGET":
        return <ViewerCountWidget widget={widget} />;
      default:
        return <StatusWidget label={widget.type} value={widget.name} />;
    }
  }, [widget, state, chatMessages]);

  const showBackground = widget.type === "VIEWER_COUNT_WIDGET" ? bool(config.showBackground, true) : true;

  if (isAudioOnlyWidgetType(widget.type)) {
    return widget.type === "SOUND_WIDGET" && audioSource ? (
      <audio ref={audioRef} src={audioSource} preload="auto" />
    ) : null;
  }

  return (
    <section className="absolute overflow-hidden rounded-none text-white" style={style}>
      {body}
    </section>
  );
});

function StatusWidget({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-full flex-col justify-center bg-black/70 p-4">
      <p className="mb-1 text-xs font-semibold text-ink-subtle">{label}</p>
      <p className="text-lg font-black">{value}</p>
    </div>
  );
}

function AlertWidget({ widget }: { widget: OverlayWidget }) {
  const state = widget.state?.state ?? {};
  const config = widget.config ?? {};
  const lastAction = (state.lastAction ?? {}) as Record<string, unknown>;
  const message = text(state.renderedText) || text(lastAction.renderedText) || text(config.template) || widget.name;
  const durationMs = number(lastAction.durationMs, number(config.defaultDurationMs, 0));
  const triggeredAt = typeof state.lastTriggeredAt === "string" ? Date.parse(state.lastTriggeredAt) : 0;
  const [now, setNow] = useState(() => Date.now());

  const backgroundColor = rgba(color(config.backgroundColor, "#000000"), clamp(number(config.backgroundOpacity, 0.7), 0, 1));
  const accentColor = color(config.accentColor, "#E5FC52");
  const textColor = color(config.textColor, "#ffffff");
  const fontSize = clamp(number(config.fontSize, 30), 10, 96);
  const fontFamily = fontFamilyValue(text(config.fontFamily, "system"));
  const fontWeight = fontWeightValue(text(config.fontWeight, "black"));
  const borderRadius = clamp(number(config.borderRadius, 0), 0, 48);
  const showLabel = bool(config.showLabel, true);
  const textShadow = bool(config.textShadow, false) ? "0 1px 2px rgba(0,0,0,0.55)" : undefined;
  const animationType = choice(config.animationType, ["none", "fade", "slide-up", "pop"] as const, "none");
  const exitAnimationType = choice(config.exitAnimationType, ["none", "fade", "slide-up", "pop"] as const, animationType);
  const animationDuration = clamp(number(config.animationDuration, 0.3), 0.1, 2);

  useEffect(() => {
    if (!durationMs || !triggeredAt) return;
    const remaining = triggeredAt + durationMs - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [durationMs, triggeredAt]);

  const visible = !durationMs || !triggeredAt || now - triggeredAt < durationMs;

  const initial: Record<string, number> = {};
  if (animationType === "fade") initial.opacity = 0;
  if (animationType === "slide-up") { initial.opacity = 0; initial.y = 20; }
  if (animationType === "pop") { initial.opacity = 0; initial.scale = 0.5; }
  const exit: Record<string, number> = {};
  if (exitAnimationType === "fade") exit.opacity = 0;
  if (exitAnimationType === "slide-up") { exit.opacity = 0; exit.y = -20; }
  if (exitAnimationType === "pop") { exit.opacity = 0; exit.scale = 0.5; }

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key={triggeredAt || "alert"}
          initial={initial}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={exit}
          transition={{ duration: animationDuration }}
          className="flex h-full items-center gap-4 p-5"
          style={{ background: backgroundColor, borderLeft: `4px solid ${accentColor}`, borderRadius, fontFamily }}
        >
          <div>
            {showLabel ? <p className="mb-1 text-xs font-semibold text-ink-subtle">Alert</p> : null}
            <p className="leading-tight" style={{ color: textColor, fontSize, fontWeight, textShadow }}>{message}</p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function GoalWidget({ widget }: { widget: OverlayWidget }) {
  const state = widget.state?.state ?? {};
  const config = widget.config ?? {};
  const current = number(state.current, 0);
  const target = Math.max(1, number(state.target, number(config.target, 100)));
  const progress = Math.max(0, Math.min(100, (current / target) * 100));

  const backgroundColor = rgba(color(config.backgroundColor, "#000000"), clamp(number(config.backgroundOpacity, 0.7), 0, 1));
  const textColor = color(config.textColor, "#ffffff");
  const barColor = color(config.barColor, "#E5FC52");
  const barBackgroundColor = rgba(color(config.barBackgroundColor, "#0F0F13"), clamp(number(config.barBackgroundOpacity, 0.5), 0, 1));
  const barHeight = clamp(number(config.barHeight, 24), 4, 80);
  const fontSize = clamp(number(config.fontSize, 12), 8, 48);
  const fontFamily = fontFamilyValue(text(config.fontFamily, "system"));
  const fontWeight = fontWeightValue(text(config.fontWeight, "600"));
  const borderRadius = clamp(number(config.borderRadius, 0), 0, 48);
  const showValues = bool(config.showValues, true);
  const showPercent = bool(config.showPercent, false);

  return (
    <div className="flex h-full flex-col justify-center p-5" style={{ background: backgroundColor, borderRadius, fontFamily }}>
      <div className="mb-3 flex justify-between" style={{ color: textColor, fontSize, fontWeight }}>
        <span>{text(config.label, "Goal")}</span>
        {showValues ? (
          <span style={{ color: barColor }}>
            {current}/{target}
            {showPercent ? ` (${Math.round(progress)}%)` : ""}
          </span>
        ) : null}
      </div>
      <div style={{ height: barHeight, background: barBackgroundColor, borderRadius }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progress}%`, background: barColor, borderRadius }} />
      </div>
    </div>
  );
}

function EventListWidget({ widget }: { widget: OverlayWidget }) {
  const config = widget.config ?? {};
  const maxItems = Math.round(clamp(number(config.maxItems, 8), 1, 20));
  const items = Array.isArray(widget.state?.state?.items) ? widget.state.state.items.slice(0, maxItems) : [];
  const backgroundColor = rgba(color(config.backgroundColor, "#000000"), clamp(number(config.backgroundOpacity, 0.7), 0, 1));
  const itemBackground = rgba(color(config.itemBackgroundColor, "#0F0F13"), clamp(number(config.itemBackgroundOpacity, 0.4), 0, 1));
  const accentColor = color(config.accentColor, "#E5FC52");
  const textColor = color(config.textColor, "#ffffff");
  const fontSize = clamp(number(config.fontSize, 12), 8, 32);
  const fontFamily = fontFamilyValue(text(config.fontFamily, "system"));
  const fontWeight = fontWeightValue(text(config.fontWeight, "bold"));
  const borderRadius = clamp(number(config.borderRadius, 0), 0, 32);
  const showHeader = bool(config.showHeader, true);

  return (
    <div className="h-full space-y-3 overflow-hidden p-4" style={{ background: backgroundColor, fontFamily }}>
      {showHeader ? <p className="mb-2 text-xs font-semibold text-ink-subtle">{text(config.headerText, "Recent Events")}</p> : null}
      {items.map((item, index) => {
        const renderedText = item && typeof item === "object" ? text((item as Record<string, unknown>).renderedText) : "";
        return (
          <p key={index} className="truncate px-3 py-2" style={{ background: itemBackground, borderLeft: `2px solid ${accentColor}`, color: textColor, fontSize, fontWeight, borderRadius }}>
            {renderedText || JSON.stringify(item)}
          </p>
        );
      })}
    </div>
  );
}

function ChatWidget({ widget, chatMessages }: { widget: OverlayWidget; chatMessages: UnifiedChatMessage[] }) {
  const config = widget.config ?? {};
  const maxMessages = Math.max(1, Math.min(20, number(config.maxMessages, 8)));
  const visibleMessages = chatMessages.slice(-maxMessages);
  const showPlatformLogo = bool(config.showPlatformLogo, true);
  const showAvatar = bool(config.showAvatar, true);
  const showName = bool(config.showName, true);
  const showEmptyState = bool(config.showEmptyState, true);
  const maxNameLength = Number(config.maxNameLength) || 0;
  const showBadges = bool(config.showBadges, true);
  const badgesPosition = choice(config.badgesPosition, ["before_name", "after_name"] as const, "after_name");
  const animationType = choice(config.animationType, ["none", "fade", "slide-up", "slide-left", "slide-right", "pop"] as const, bool(config.animateMessages, true) ? "fade" : "none");
  const exitAnimationType = choice(config.exitAnimationType, ["none", "fade", "slide-up", "slide-left", "slide-right", "pop"] as const, bool(config.animateMessages, true) ? "fade" : "none");
  const animationDuration = number(config.animationDuration, 0.3);
  const hideAfter = number(config.hideAfter, 0);
  const compactMode = bool(config.compactMode, false);
  const inlineMessage = bool(config.inlineMessage, false);
  const nameMessageSpacing = number(config.nameMessageSpacing, 4);
  const textShadow = bool(config.textShadow, true);
  const order = choice(config.order, ["newest-bottom", "newest-top"] as const, "newest-bottom");
  const align = choice(config.align, ["left", "right"] as const, "left");
  const verticalAlign = choice(config.verticalAlign, ["top", "bottom"] as const, "bottom");
  const fontFamily = typeof config.fontFamily === "string" && config.fontFamily ? config.fontFamily : "system";
  const nameFontFamily = typeof config.nameFontFamily === "string" && config.nameFontFamily ? config.nameFontFamily : fontFamily;
  const bubbleStyle = "solid";
  const rawFontWeight = String(config.fontWeight || "normal");
  const fontWeight = ["100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "medium", "bold", "black"].includes(rawFontWeight) ? rawFontWeight : "normal";
  const rawNameFontWeight = String(config.nameFontWeight || "bold");
  const nameFontWeight = ["100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "medium", "bold", "black"].includes(rawNameFontWeight) ? rawNameFontWeight : "bold";
  const avatarShape = choice(config.avatarShape, ["circle", "rounded", "square"] as const, "circle");
  const backgroundColor = color(config.backgroundColor, "#000000");
  const bubbleColor = color(config.bubbleColor, "#000000");
  const textColor = color(config.textColor, "#ffffff");
  const useOwnerTextColor = bool(config.useOwnerTextColor, false);
  const ownerTextColor = color(config.ownerTextColor, "#fbbf24");
  const useModTextColor = bool(config.useModTextColor, false);
  const modTextColor = color(config.modTextColor, "#34d399");
  const useMemberTextColor = bool(config.useMemberTextColor, false);
  const memberTextColor = color(config.memberTextColor, "#a78bfa");
  const useOwnerNameColor = bool(config.useOwnerNameColor, false);
  const ownerNameColor = color(config.ownerNameColor, "#fbbf24");
  const useModNameColor = bool(config.useModNameColor, false);
  const modNameColor = color(config.modNameColor, "#34d399");
  const useMemberNameColor = bool(config.useMemberNameColor, false);
  const memberNameColor = color(config.memberNameColor, "#a78bfa");
  const youtubeNameColor = color(config.youtubeNameColor, "#fca5a5");
  const tiktokNameColor = color(config.tiktokNameColor, "#f9a8d4");
  const twitchNameColor = color(config.twitchNameColor, "#c4b5fd");
  const randomNameColor = bool(config.randomNameColor, false);
  const backgroundOpacity = clamp(number(config.backgroundOpacity, 0), 0, 1);
  const bubbleOpacity = clamp(number(config.bubbleOpacity, 0.55), 0, 1);
  const borderColor = color(config.borderColor, "#ffffff");
  const borderOpacity = clamp(number(config.borderOpacity, 0.1), 0, 1);
  const separateBubbles = bool(config.separateBubbles, false);
  const nameBubbleColor = color(config.nameBubbleColor, "#000000");
  const nameBubbleOpacity = clamp(number(config.nameBubbleOpacity, 0.55), 0, 1);
  const nameBorderWidth = clamp(number(config.nameBorderWidth, 1), 0, 20);
  const nameBorderColor = color(config.nameBorderColor, "#ffffff");
  const nameBorderRadius = clamp(number(config.nameBorderRadius, 6), 0, 32);
  const nameBorderOpacity = clamp(number(config.nameBorderOpacity, 0.1), 0, 1);
  const nameBubbleDropShadow = bool(config.nameBubbleDropShadow, false);
  const nameBubbleShadowX = number(config.nameBubbleShadowX, 0);
  const nameBubbleShadowY = number(config.nameBubbleShadowY, 4);
  const nameBubbleShadowBlur = clamp(number(config.nameBubbleShadowBlur, 8), 0, 50);
  const nameBubbleShadowColor = rgba(color(config.nameBubbleShadowColor, "#000000"), clamp(number(config.nameBubbleShadowOpacity, 0.5), 0, 1));
  const nameBubbleGradient = bool(config.nameBubbleGradient, false);
  const nameBubbleGradientColor = color(config.nameBubbleGradientColor, "#000000");
  const nameBubbleGradientAngle = number(config.nameBubbleGradientAngle, 180);
  const borderWidth = clamp(number(config.borderWidth, 1), 0, 20);
  const fontSize = clamp(number(config.fontSize, 15), 10, 36);
  const nameFontSize = clamp(number(config.nameFontSize, 13), 10, 28);
  const avatarSize = clamp(number(config.avatarSize, 32), 18, 80);
  const avatarBorderWidth = clamp(number(config.avatarBorderWidth, 2), 0, 8);
  const avatarBorderColor = rgba(color(config.avatarBorderColor, "#ffffff"), clamp(number(config.avatarBorderOpacity, 0.15), 0, 1));
  const platformLogoSize = clamp(number(config.platformLogoSize, 16), 10, 40);
  const platformLogoBorderWidth = clamp(number(config.platformLogoBorderWidth, 0), 0, 8);
  const platformLogoBorderColor = rgba(color(config.platformLogoBorderColor, "#ffffff"), clamp(number(config.platformLogoBorderOpacity, 0.15), 0, 1));
  const badgeSize = clamp(number(config.badgeSize, 16), 10, 40);
  const badgeBorderWidth = clamp(number(config.badgeBorderWidth, 0), 0, 8);
  const badgeBorderColor = rgba(color(config.badgeBorderColor, "#ffffff"), clamp(number(config.badgeBorderOpacity, 0.15), 0, 1));
  const padding = clamp(number(config.padding, 12), 0, 40);
  const gap = clamp(number(config.gap, 8), 0, 28);
  const borderRadius = clamp(number(config.borderRadius, 6), 0, 32);
  const messagePaddingX = clamp(number(config.messagePaddingX, 12), 4, 32);
  const messagePaddingY = clamp(number(config.messagePaddingY, 8), 2, 24);
  const textStrokeWidth = clamp(number(config.textStrokeWidth, 0), 0, 10);
  const textStrokeColor = color(config.textStrokeColor, "#000000");
  const nameTextStrokeWidth = clamp(number(config.nameTextStrokeWidth, textStrokeWidth), 0, 10);
  const nameTextStrokeColor = color(config.nameTextStrokeColor, textStrokeColor);
  const textShadowX = number(config.textShadowX, 0);
  const textShadowY = number(config.textShadowY, 1);
  const textShadowBlur = clamp(number(config.textShadowBlur, 1), 0, 20);
  const textShadowColor = rgba(color(config.textShadowColor, "#000000"), clamp(number(config.textShadowOpacity, 0.55), 0, 1));
  const nameTextShadow = bool(config.nameTextShadow, textShadow);
  const nameTextShadowX = number(config.nameTextShadowX, textShadowX);
  const nameTextShadowY = number(config.nameTextShadowY, textShadowY);
  const nameTextShadowBlur = clamp(number(config.nameTextShadowBlur, textShadowBlur), 0, 20);
  const nameTextShadowColor = rgba(color(config.nameTextShadowColor, color(config.textShadowColor, "#000000")), clamp(number(config.nameTextShadowOpacity, number(config.textShadowOpacity, 0.55)), 0, 1));
  const bubbleDropShadow = bool(config.bubbleDropShadow, false);
  const bubbleShadowX = number(config.bubbleShadowX, 0);
  const bubbleShadowY = number(config.bubbleShadowY, 4);
  const bubbleShadowBlur = clamp(number(config.bubbleShadowBlur, 8), 0, 50);
  const bubbleShadowColor = rgba(color(config.bubbleShadowColor, "#000000"), clamp(number(config.bubbleShadowOpacity, 0.5), 0, 1));
  const backgroundGradient = bool(config.backgroundGradient, false);
  const backgroundGradientColor = color(config.backgroundGradientColor, "#000000");
  const backgroundGradientAngle = number(config.backgroundGradientAngle, 180);
  const bubbleGradient = bool(config.bubbleGradient, false);
  const bubbleGradientColor = color(config.bubbleGradientColor, "#000000");
  const bubbleGradientAngle = number(config.bubbleGradientAngle, 180);

  const displayMessages = [...visibleMessages].reverse();
  const listDirection = order === "newest-top" ? "flex-col" : "flex-col-reverse";
  const isCustomFont = fontFamily !== "system" && fontFamily !== "mono";
  const containerStyle: CSSProperties = {
    background: backgroundGradient ? `linear-gradient(${backgroundGradientAngle}deg, ${rgba(backgroundColor, backgroundOpacity)}, ${rgba(backgroundGradientColor, backgroundOpacity)})` : rgba(backgroundColor, backgroundOpacity),
    padding,
    fontFamily: isCustomFont ? `"${fontFamily}", sans-serif` : undefined
  };
  const bubbleCss: CSSProperties = {
    borderRadius,
    color: textColor,
    fontSize,
    padding: `${messagePaddingY}px ${messagePaddingX}px`,
    fontWeight: !isNaN(parseInt(fontWeight, 10)) ? parseInt(fontWeight, 10) : fontWeight === "black" ? 900 : fontWeight === "bold" ? 700 : fontWeight === "medium" ? 500 : 400,
    background: bubbleGradient ? `linear-gradient(${bubbleGradientAngle}deg, ${rgba(bubbleColor, bubbleOpacity)}, ${rgba(bubbleGradientColor, bubbleOpacity)})` : rgba(bubbleColor, bubbleOpacity),
    border: `${borderWidth}px solid ${rgba(borderColor, borderOpacity)}`,
    boxShadow: bubbleDropShadow
      ? `${bubbleShadowX}px ${bubbleShadowY}px ${bubbleShadowBlur}px ${bubbleShadowColor}`
      : undefined,
  };
  const nameBubbleCss: CSSProperties = {
    borderRadius: nameBorderRadius,
    background: nameBubbleGradient ? `linear-gradient(${nameBubbleGradientAngle}deg, ${rgba(nameBubbleColor, nameBubbleOpacity)}, ${rgba(nameBubbleGradientColor, nameBubbleOpacity)})` : rgba(nameBubbleColor, nameBubbleOpacity),
    border: `${nameBorderWidth}px solid ${rgba(nameBorderColor, nameBorderOpacity)}`,
    boxShadow: nameBubbleDropShadow
      ? `${nameBubbleShadowX}px ${nameBubbleShadowY}px ${nameBubbleShadowBlur}px ${nameBubbleShadowColor}`
      : undefined,
    padding: separateBubbles ? `${messagePaddingY / 1.5}px ${messagePaddingX}px` : undefined,
  };
  const textShadowOutline = useMemo(() => getSmoothOutlineShadows(textStrokeWidth, textStrokeColor), [textStrokeWidth, textStrokeColor]);
  const nameTextShadowOutline = useMemo(() => getSmoothOutlineShadows(nameTextStrokeWidth, nameTextStrokeColor), [nameTextStrokeWidth, nameTextStrokeColor]);

  const getAnimationVariants = (entry: string, exit: string) => {
    const variants: any = {
      initial: { opacity: 1, scale: 1, x: 0, y: 0 },
      animate: { opacity: 1, scale: 1, x: 0, y: 0 },
      exit: { opacity: 1, scale: 1, x: 0, y: 0 }
    };

    switch (entry) {
      case "fade": variants.initial.opacity = 0; break;
      case "slide-up": variants.initial.opacity = 0; variants.initial.y = 20; break;
      case "slide-left": variants.initial.opacity = 0; variants.initial.x = 20; break;
      case "slide-right": variants.initial.opacity = 0; variants.initial.x = -20; break;
      case "pop": variants.initial.opacity = 0; variants.initial.scale = 0.5; break;
      default: break;
    }

    switch (exit) {
      case "fade": variants.exit.opacity = 0; break;
      case "slide-up": variants.exit.opacity = 0; variants.exit.y = -20; break;
      case "slide-left": variants.exit.opacity = 0; variants.exit.x = -20; break;
      case "slide-right": variants.exit.opacity = 0; variants.exit.x = 20; break;
      case "pop": variants.exit.opacity = 0; variants.exit.scale = 0.5; break;
      default: break;
    }

    return variants;
  };
  const animationVariants = getAnimationVariants(animationType, exitAnimationType);
  const enableAnimation = animationType !== "none" || exitAnimationType !== "none";
  const shapeClass = avatarShape === "circle" ? "rounded-full" : avatarShape === "rounded" ? "rounded-xl" : "rounded-none";

  return (
    <div className={`flex h-full flex-col ${verticalAlign === "top" ? "justify-start" : "justify-end"} overflow-hidden bg-transparent ${fontFamily === "mono" ? "font-mono" : ""}`} style={containerStyle}>
      <div className={`relative flex min-h-0 ${listDirection} overflow-y-auto pr-1 scrollbar-hide`} style={{ gap }}>
        <AnimatePresence initial={false} mode="popLayout">
          {visibleMessages.length === 0 && showEmptyState ? (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-none border-2 border-border-base bg-surface-base px-4 py-3 text-xs font-semibold text-ink-subtle"
            >
              รอข้อความแชท...
            </motion.div>
          ) : (
            displayMessages.map((msg) => {
              let msgTextColor = textColor;
              let nameColor = msg.platform === "youtube" ? youtubeNameColor : msg.platform === "tiktok" ? tiktokNameColor : twitchNameColor;

              if (randomNameColor) {
                const str = msg.username || msg.displayName || "";
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                  hash = str.charCodeAt(i) + ((hash << 5) - hash);
                }
                const hue = Math.abs(hash) % 360;
                nameColor = `hsl(${hue}, 85%, 75%)`;
              }

              if (msg.badges) {
                const badgeLabels = msg.badges.map(b => b.label.toLowerCase());
                const isOwner = badgeLabels.includes("broadcaster") || badgeLabels.includes("owner") || badgeLabels.includes("host") || badgeLabels.includes("creator");
                const isMod = badgeLabels.includes("moderator");
                const isMember = badgeLabels.includes("subscriber") || badgeLabels.includes("member") || badgeLabels.includes("vip") || badgeLabels.includes("founder");

                if (useOwnerTextColor && isOwner) {
                  msgTextColor = ownerTextColor;
                } else if (useModTextColor && isMod) {
                  msgTextColor = modTextColor;
                } else if (useMemberTextColor && isMember) {
                  msgTextColor = memberTextColor;
                }

                if (useOwnerNameColor && isOwner) {
                  nameColor = ownerNameColor;
                } else if (useModNameColor && isMod) {
                  nameColor = modNameColor;
                } else if (useMemberNameColor && isMember) {
                  nameColor = memberNameColor;
                }
              }

              return (
                <motion.div
                  key={msg.id}
                  variants={animationVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={enableAnimation ? { duration: animationDuration } : { duration: 0 }}
                  style={hideAfter > 0 ? { animation: `fadeOut 0.5s ease-in ${hideAfter}s forwards` } : {}}
                  className={`flex ${align === "right" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`flex items-start gap-2 max-w-full ${align === "right" ? "flex-row-reverse" : ""}`}>
                    {showAvatar && msg.platform !== "twitch" ? (
                      <div className="relative mt-0.5 flex-shrink-0" style={{ height: avatarSize, width: avatarSize }}>
                        {msg.avatarUrl ? (
                          <img src={msg.avatarUrl} alt="" referrerPolicy="no-referrer" className={`h-full w-full object-cover ${shapeClass}`} style={{ borderWidth: avatarBorderWidth, borderColor: avatarBorderColor, borderStyle: avatarBorderWidth > 0 ? 'solid' : 'none' }} />
                        ) : (
                          <span className={`flex h-full w-full items-center justify-center text-xs font-bold text-white ${shapeClass} ${msg.platform === "tiktok" ? "bg-slate-900" : "bg-white"}`} style={{ borderWidth: avatarBorderWidth, borderColor: avatarBorderColor, borderStyle: avatarBorderWidth > 0 ? 'solid' : 'none' }}>
                            {msg.platform === "tiktok" ? <TiktokIcon className="h-5 w-5" /> : <YoutubeIcon className="h-6 w-6" />}
                          </span>
                        )}
                      </div>
                    ) : null}
                    <div
                      className={`min-w-0 max-w-full ${separateBubbles && !inlineMessage ? "flex flex-col" : ""} ${!separateBubbles || inlineMessage ? "shadow-md" : ""} ${align === "right" ? (separateBubbles && !inlineMessage ? "items-end text-right" : "text-right") : (separateBubbles && !inlineMessage ? "items-start text-left" : "")}`}
                      style={!separateBubbles || inlineMessage ? { ...bubbleCss, color: msgTextColor } : { color: msgTextColor }}
                    >
                      {inlineMessage && !compactMode ? (
                        <p className={`break-words leading-snug ${align === "right" ? "text-right" : ""}`} style={{
                          padding: `0 ${textStrokeWidth}px`,
                          marginLeft: `-${textStrokeWidth}px`,
                          marginRight: `-${textStrokeWidth}px`,
                          textShadow: textShadowOutline || undefined,
                          filter: textShadow ? `drop-shadow(${textShadowX}px ${textShadowY}px ${textShadowBlur}px ${textShadowColor})` : undefined
                        }}>
                          <span
                            className={`inline-flex items-center gap-1.5 align-middle ${align === "right" ? "flex-row-reverse" : ""}`}
                            style={{
                              ...(separateBubbles ? nameBubbleCss : {}),
                              [align === "right" ? "marginLeft" : "marginRight"]: `${nameMessageSpacing}px`
                            }}
                          >
                            {showPlatformLogo ? (
                              msg.platform === "tiktok" ? (
                                <span className="flex-shrink-0 drop-shadow-sm rounded-full flex items-center justify-center" style={{ width: platformLogoSize, height: platformLogoSize, borderWidth: platformLogoBorderWidth, borderColor: platformLogoBorderColor, borderStyle: platformLogoBorderWidth > 0 ? 'solid' : 'none', background: platformLogoBorderWidth > 0 ? "#000" : "transparent", overflow: 'hidden' }}>
                                  <TiktokIcon className="w-full h-full" style={{ transform: platformLogoBorderWidth > 0 ? "scale(1.15)" : "none" }} />
                                </span>
                              ) : msg.platform === "twitch" ? (
                                <span className="flex-shrink-0 drop-shadow-sm rounded-full flex items-center justify-center" style={{ width: platformLogoSize, height: platformLogoSize, borderWidth: platformLogoBorderWidth, borderColor: platformLogoBorderColor, borderStyle: platformLogoBorderWidth > 0 ? 'solid' : 'none', background: platformLogoBorderWidth > 0 ? "#9146FF" : "transparent", overflow: 'hidden' }}>
                                  <TwitchIcon className="w-full h-full" style={{ transform: platformLogoBorderWidth > 0 ? "scale(1.15)" : "none" }} />
                                </span>
                              ) : (
                                <span className="flex-shrink-0 drop-shadow-sm rounded-full flex items-center justify-center" style={{ width: platformLogoSize, height: platformLogoSize, borderWidth: platformLogoBorderWidth, borderColor: platformLogoBorderColor, borderStyle: platformLogoBorderWidth > 0 ? 'solid' : 'none', background: platformLogoBorderWidth > 0 ? "#fff" : "transparent", overflow: 'hidden' }}>
                                  <YoutubeIcon className="w-full h-full" style={{ transform: platformLogoBorderWidth > 0 ? "scale(1.15)" : "none" }} />
                                </span>
                              )
                            ) : null}
                            {showName ? (
                              <span className="flex items-center gap-1.5 shrink-0">
                                {showBadges && badgesPosition === "before_name" && msg.badges && msg.badges.length > 0 ? (
                                  <span className="flex items-center gap-1 shrink-0">
                                    {msg.badges.map((badge, i) =>
                                      badge.url ? (
                                        <img key={i} src={badge.url} alt={badge.label} title={badge.label} className={`object-contain rounded-full ${badge.url.includes('googlesymbols') ? 'invert opacity-80' : ''}`} style={{ width: badgeSize, height: badgeSize, borderWidth: badgeBorderWidth, borderColor: badgeBorderColor, borderStyle: badgeBorderWidth > 0 ? 'solid' : 'none', background: badgeBorderWidth > 0 ? 'rgba(0,0,0,0.5)' : 'transparent' }} />
                                      ) : (
                                        <span key={i} className="font-black uppercase tracking-wider bg-white/20 px-1 rounded-sm flex items-center justify-center" style={{ height: badgeSize, fontSize: Math.max(10, badgeSize * 0.6), borderWidth: badgeBorderWidth, borderColor: badgeBorderColor, borderStyle: badgeBorderWidth > 0 ? 'solid' : 'none' }}>{badge.label}</span>
                                      )
                                    )}
                                  </span>
                                ) : null}
                                <span
                                  className="font-bold tracking-tight leading-tight"
                                  style={{
                                    padding: `0 ${nameTextStrokeWidth}px`,
                                    marginLeft: `-${nameTextStrokeWidth}px`,
                                    marginRight: `-${nameTextStrokeWidth}px`,
                                    fontSize: `${nameFontSize}px`,
                                    color: nameColor,
                                    fontWeight: !isNaN(parseInt(nameFontWeight, 10)) ? parseInt(nameFontWeight, 10) : nameFontWeight === "black" ? 900 : nameFontWeight === "bold" ? 700 : nameFontWeight === "medium" ? 500 : 400,
                                    fontFamily: nameFontFamily !== "system" && nameFontFamily !== "mono" ? `"${nameFontFamily}", sans-serif` : nameFontFamily === "mono" ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : "system-ui, -apple-system, sans-serif",
                                    textShadow: nameTextShadowOutline || undefined,
                                    filter: nameTextShadow ? `drop-shadow(${nameTextShadowX}px ${nameTextShadowY}px ${nameTextShadowBlur}px ${nameTextShadowColor})` : undefined
                                  }}
                                >
                                  {maxNameLength > 0 && msg.displayName.length > maxNameLength ? `${msg.displayName.substring(0, maxNameLength)}...` : msg.displayName}
                                </span>
                                {showBadges && badgesPosition === "after_name" && msg.badges && msg.badges.length > 0 ? (
                                  <span className="flex items-center gap-1 shrink-0">
                                    {msg.badges.map((badge, i) =>
                                      badge.url ? (
                                        <img key={i} src={badge.url} alt={badge.label} title={badge.label} className={`object-contain rounded-full ${badge.url.includes('googlesymbols') ? 'invert opacity-80' : ''}`} style={{ width: badgeSize, height: badgeSize, borderWidth: badgeBorderWidth, borderColor: badgeBorderColor, borderStyle: badgeBorderWidth > 0 ? 'solid' : 'none', background: badgeBorderWidth > 0 ? 'rgba(0,0,0,0.5)' : 'transparent' }} />
                                      ) : (
                                        <span key={i} className="font-black uppercase tracking-wider bg-white/20 px-1 rounded-sm flex items-center justify-center" style={{ height: badgeSize, fontSize: Math.max(10, badgeSize * 0.6), borderWidth: badgeBorderWidth, borderColor: badgeBorderColor, borderStyle: badgeBorderWidth > 0 ? 'solid' : 'none' }}>{badge.label}</span>
                                      )
                                    )}
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </span>
                          {renderChatMessageText(msg.message)}
                        </p>
                      ) : (
                        <>
                          {(showPlatformLogo || showName) && !compactMode ? (
                            <div
                              className={`flex min-w-0 items-center gap-2 ${align === "right" ? "justify-end" : ""}`}
                              style={{
                                ...(separateBubbles ? nameBubbleCss : {}),
                                marginBottom: `${nameMessageSpacing}px`
                              }}
                            >
                              {showPlatformLogo ? (
                                msg.platform === "tiktok" ? (
                                  <span className="flex-shrink-0 drop-shadow-sm rounded-full flex items-center justify-center" style={{ width: platformLogoSize, height: platformLogoSize, borderWidth: platformLogoBorderWidth, borderColor: platformLogoBorderColor, borderStyle: platformLogoBorderWidth > 0 ? 'solid' : 'none', background: platformLogoBorderWidth > 0 ? "#000" : "transparent", overflow: 'hidden' }}>
                                    <TiktokIcon className="w-full h-full" style={{ transform: platformLogoBorderWidth > 0 ? "scale(1.15)" : "none" }} />
                                  </span>
                                ) : msg.platform === "twitch" ? (
                                  <span className="flex-shrink-0 drop-shadow-sm rounded-full flex items-center justify-center" style={{ width: platformLogoSize, height: platformLogoSize, borderWidth: platformLogoBorderWidth, borderColor: platformLogoBorderColor, borderStyle: platformLogoBorderWidth > 0 ? 'solid' : 'none', background: platformLogoBorderWidth > 0 ? "#9146FF" : "transparent", overflow: 'hidden' }}>
                                    <TwitchIcon className="w-full h-full" style={{ transform: platformLogoBorderWidth > 0 ? "scale(1.15)" : "none" }} />
                                  </span>
                                ) : (
                                  <span className="flex-shrink-0 drop-shadow-sm rounded-full flex items-center justify-center" style={{ width: platformLogoSize, height: platformLogoSize, borderWidth: platformLogoBorderWidth, borderColor: platformLogoBorderColor, borderStyle: platformLogoBorderWidth > 0 ? 'solid' : 'none', background: platformLogoBorderWidth > 0 ? "#fff" : "transparent", overflow: 'hidden' }}>
                                    <YoutubeIcon className="w-full h-full" style={{ transform: platformLogoBorderWidth > 0 ? "scale(1.15)" : "none" }} />
                                  </span>
                                )
                              ) : null}
                              {showName ? (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {showBadges && badgesPosition === "before_name" && msg.badges && msg.badges.length > 0 ? (
                                    <div className="flex items-center gap-1 shrink-0">
                                      {msg.badges.map((badge, i) =>
                                        badge.url ? (
                                          <img key={i} src={badge.url} alt={badge.label} title={badge.label} className={`object-contain rounded-full ${badge.url.includes('googlesymbols') ? 'invert opacity-80' : ''}`} style={{ width: badgeSize, height: badgeSize, borderWidth: badgeBorderWidth, borderColor: badgeBorderColor, borderStyle: badgeBorderWidth > 0 ? 'solid' : 'none', background: badgeBorderWidth > 0 ? 'rgba(0,0,0,0.5)' : 'transparent' }} />
                                        ) : (
                                          <span key={i} className="font-black uppercase tracking-wider bg-white/20 px-1 rounded-sm flex items-center justify-center" style={{ height: badgeSize, fontSize: Math.max(10, badgeSize * 0.6), borderWidth: badgeBorderWidth, borderColor: badgeBorderColor, borderStyle: badgeBorderWidth > 0 ? 'solid' : 'none' }}>{badge.label}</span>
                                        )
                                      )}
                                    </div>
                                  ) : null}
                                  <span
                                    className="truncate font-bold tracking-tight leading-tight"
                                    style={{
                                      padding: `0 ${nameTextStrokeWidth}px`,
                                      marginLeft: `-${nameTextStrokeWidth}px`,
                                      marginRight: `-${nameTextStrokeWidth}px`,
                                      fontSize: `${nameFontSize}px`,
                                      color: nameColor,
                                      fontWeight: !isNaN(parseInt(nameFontWeight, 10)) ? parseInt(nameFontWeight, 10) : nameFontWeight === "black" ? 900 : nameFontWeight === "bold" ? 700 : nameFontWeight === "medium" ? 500 : 400,
                                      fontFamily: nameFontFamily !== "system" && nameFontFamily !== "mono" ? `"${nameFontFamily}", sans-serif` : nameFontFamily === "mono" ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : "system-ui, -apple-system, sans-serif",
                                      textShadow: nameTextShadowOutline || undefined,
                                      filter: nameTextShadow ? `drop-shadow(${nameTextShadowX}px ${nameTextShadowY}px ${nameTextShadowBlur}px ${nameTextShadowColor})` : undefined
                                    }}
                                  >
                                    {maxNameLength > 0 && msg.displayName.length > maxNameLength ? `${msg.displayName.substring(0, maxNameLength)}...` : msg.displayName}
                                  </span>

                                  {showBadges && badgesPosition === "after_name" && msg.badges && msg.badges.length > 0 ? (
                                    <div className="flex items-center gap-1 shrink-0">
                                      {msg.badges.map((badge, i) =>
                                        badge.url ? (
                                          <img key={i} src={badge.url} alt={badge.label} title={badge.label} className={`object-contain rounded-full ${badge.url.includes('googlesymbols') ? 'invert opacity-80' : ''}`} style={{ width: badgeSize, height: badgeSize, borderWidth: badgeBorderWidth, borderColor: badgeBorderColor, borderStyle: badgeBorderWidth > 0 ? 'solid' : 'none', background: badgeBorderWidth > 0 ? 'rgba(0,0,0,0.5)' : 'transparent' }} />
                                        ) : (
                                          <span key={i} className="font-black uppercase tracking-wider bg-white/20 px-1 rounded-sm flex items-center justify-center" style={{ height: badgeSize, fontSize: Math.max(10, badgeSize * 0.6), borderWidth: badgeBorderWidth, borderColor: badgeBorderColor, borderStyle: badgeBorderWidth > 0 ? 'solid' : 'none' }}>{badge.label}</span>
                                        )
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          <div
                            className={`min-w-0 ${separateBubbles ? "shadow-md" : ""}`}
                            style={separateBubbles ? { ...bubbleCss, color: msgTextColor } : undefined}
                          >
                            <p className="break-words leading-snug" style={{
                              padding: `0 ${textStrokeWidth}px`,
                              marginLeft: `-${textStrokeWidth}px`,
                              marginRight: `-${textStrokeWidth}px`,
                              textShadow: textShadowOutline || undefined,
                              filter: textShadow ? `drop-shadow(${textShadowX}px ${textShadowY}px ${textShadowBlur}px ${textShadowColor})` : undefined
                            }}>
                              {renderChatMessageText(msg.message)}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ImageWidget({ widget }: { widget: OverlayWidget }) {
  const state = widget.state?.state ?? {};
  const config = widget.config ?? {};
  const rawSrc = text(config.src) || text(config.url) || text(state.src);
  const src = rawSrc ? resolveMediaSrc(rawSrc) : "";
  const lastAction = (state.lastAction ?? {}) as Record<string, unknown>;
  const showMode = choice(config.showMode, ["always", "triggered"] as const, "always");
  const durationMs = number(lastAction.durationMs, number(config.defaultDurationMs, showMode === "triggered" ? 5000 : 0));
  const triggeredAt = typeof state.lastTriggeredAt === "string" ? Date.parse(state.lastTriggeredAt) : 0;
  const fit = choice(config.fit, ["contain", "cover", "fill"] as const, "contain");
  const opacity = clamp(number(config.opacity, 1), 0, 1);
  const borderRadius = clamp(number(config.borderRadius, 0), 0, 200);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!durationMs || !triggeredAt) return;
    const remaining = triggeredAt + durationMs - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [durationMs, triggeredAt]);

  const withinDuration = triggeredAt > 0 && durationMs > 0 && now - triggeredAt < durationMs;
  const visible = showMode === "triggered" ? withinDuration : !durationMs || !triggeredAt || now - triggeredAt < durationMs;
  if (!src || !visible) return src ? <div className="h-full" /> : <StatusWidget label="Image" value="ยังไม่มีรูป" />;

  return <img src={src} alt={widget.name} className="h-full w-full" style={{ objectFit: fit, opacity, borderRadius }} />;
}

function TextWidget({ widget }: { widget: OverlayWidget }) {
  const config = widget.config ?? {};
  const value = text(widget.state?.state?.text) || text(config.text) || widget.name;
  const fontSize = clamp(number(config.fontSize, 28), 8, 200);
  const fontFamily = fontFamilyValue(text(config.fontFamily, "system"));
  const fontWeight = fontWeightValue(text(config.fontWeight, "black"));
  const textColor = color(config.textColor, "#ffffff");
  const align = choice(config.align, ["left", "center", "right"] as const, "left");
  const backgroundColor = rgba(color(config.backgroundColor, "#000000"), clamp(number(config.backgroundOpacity, 0.7), 0, 1));
  const padding = clamp(number(config.padding, 16), 0, 80);
  const borderRadius = clamp(number(config.borderRadius, 0), 0, 48);
  const shadow = bool(config.textShadow, false) ? "0 1px 2px rgba(0,0,0,0.55)" : "";
  const strokeWidth = clamp(number(config.textStrokeWidth, 0), 0, 10);
  const strokeColor = color(config.textStrokeColor, "#000000");
  const stroke = useMemo(() => getSmoothOutlineShadows(strokeWidth, strokeColor), [strokeWidth, strokeColor]);
  const justifyContent = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const textShadow = [stroke, shadow].filter(Boolean).join(", ") || undefined;

  return (
    <div className="flex h-full items-center" style={{ background: backgroundColor, padding, borderRadius, justifyContent }}>
      <span style={{ color: textColor, fontSize, fontFamily, fontWeight, textAlign: align, textShadow }}>{value}</span>
    </div>
  );
}

function ViewerCountWidget({ widget }: { widget: OverlayWidget }) {
  const state = widget.state?.state ?? {};
  const config = widget.config ?? {};

  const youtubeCount = number(state.youtube, 0);
  const tiktokCount = number(state.tiktok, 0);
  const twitchCount = number(state.twitch, 0);

  const platforms = choice(config.platforms as string, ["all", "youtube", "tiktok", "twitch"], "all");
  const showYoutube = bool(config.showYoutube, platforms === "all" || platforms === "youtube");
  const showTiktok = bool(config.showTiktok, platforms === "all" || platforms === "tiktok");
  const showTwitch = bool(config.showTwitch, platforms === "all" || platforms === "twitch");
  const showBackground = bool(config.showBackground, true);
  const fontSize = number(config.fontSize, 16);
  const iconSize = number(config.iconSize, 20);
  const fontFamily = text(config.fontFamily, "Inter");
  const fontWeight = text(config.fontWeight, "700");
  const textColor = color(config.textColor, "#ffffff");
  const useSeparateColors = bool(config.useSeparateColors, false);
  const youtubeColor = color(config.youtubeColor, "#ef4444");
  const tiktokColor = color(config.tiktokColor, "#22d3ee");
  const twitchColor = color(config.twitchColor, "#c084fc");
  const textShadow = bool(config.textShadow, true);
  const backgroundColor = color(config.backgroundColor, "#000000");
  const backgroundOpacity = number(config.backgroundOpacity, 0.7);
  const borderRadius = number(config.borderRadius, 8);
  const gap = number(config.gap, 12);
  const paddingX = number(config.paddingX, 16);
  const paddingY = number(config.paddingY, 8);
  const showPingDot = bool(config.showPingDot, true);

  let dotColorClass = "bg-green-500";
  let pingColorClass = "bg-green-400";

  const activeCount = [showYoutube, showTiktok, showTwitch].filter(Boolean).length;
  if (activeCount === 1) {
    if (showYoutube) {
      dotColorClass = "bg-red-500";
      pingColorClass = "bg-red-400";
    } else if (showTiktok) {
      dotColorClass = "bg-cyan-500";
      pingColorClass = "bg-cyan-400";
    } else if (showTwitch) {
      dotColorClass = "bg-purple-500";
      pingColorClass = "bg-purple-400";
    }
  }

  const containerStyle: React.CSSProperties = {
    fontFamily: fontFamily !== "Inter" ? `'${fontFamily}', sans-serif` : "sans-serif",
    fontWeight,
    fontSize: `${fontSize}px`,
    gap: `${gap}px`,
    padding: showBackground ? `${paddingY}px ${paddingX}px` : "2px 4px",
    backgroundColor: showBackground ? rgba(backgroundColor, backgroundOpacity) : "transparent",
    borderRadius: `${borderRadius}px`,
  };

  const baseTextStyle: React.CSSProperties = {
    textShadow: textShadow ? "0 1px 2px rgba(0,0,0,0.8)" : "none",
  };

  return (
    <div className="flex h-full items-center select-none" style={containerStyle}>
      {showPingDot && (
        <span className="relative flex shrink-0" style={{ width: `${Math.max(10, iconSize * 0.5)}px`, height: `${Math.max(10, iconSize * 0.5)}px` }}>
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pingColorClass} opacity-75`}></span>
          <span className={`relative inline-flex rounded-full h-full w-full ${dotColorClass}`}></span>
        </span>
      )}

      <div className="flex items-center" style={{ gap: `${gap}px` }}>
        {[
          showYoutube && (
            <div key="youtube" className="flex items-center gap-1.5">
              <YoutubeIcon style={{ width: `${iconSize}px`, height: `${iconSize}px` }} className="text-red-500 drop-shadow-sm" />
              <span style={{ ...baseTextStyle, color: useSeparateColors ? youtubeColor : textColor }}>
                {youtubeCount.toLocaleString()}
              </span>
            </div>
          ),
          showTiktok && (
            <div key="tiktok" className="flex items-center gap-1.5">
              <TiktokIcon style={{ width: `${iconSize * 0.9}px`, height: `${iconSize * 0.9}px` }} className="text-cyan-400 drop-shadow-sm" />
              <span style={{ ...baseTextStyle, color: useSeparateColors ? tiktokColor : textColor }}>
                {tiktokCount.toLocaleString()}
              </span>
            </div>
          ),
          showTwitch && (
            <div key="twitch" className="flex items-center gap-1.5">
              <TwitchIcon style={{ width: `${iconSize * 0.9}px`, height: `${iconSize * 0.9}px` }} className="text-purple-400 drop-shadow-sm" />
              <span style={{ ...baseTextStyle, color: useSeparateColors ? twitchColor : textColor }}>
                {twitchCount.toLocaleString()}
              </span>
            </div>
          )
        ].filter(Boolean).map((item, index, arr) => (
          <Fragment key={(item as React.ReactElement).key}>
            {item}
            {index < arr.length - 1 && (
              <div className="w-px bg-white/20 self-center" style={{ height: `${iconSize * 0.8}px` }} />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

