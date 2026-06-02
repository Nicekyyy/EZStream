"use client";

import { useEffect, useMemo, useRef, useState, memo, type CSSProperties, type ReactNode } from "react";
import type { UnifiedChatMessage } from "@ezstream/shared";

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

function rgba(hex: string, alpha: number) {
  const normalized = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex.slice(0, 7);
  const value = Number.parseInt(normalized.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function isInlineEmojiUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return (
      /\.(?:png|webp|gif|jpe?g|svg)$/.test(path) ||
      host === "yt3.ggpht.com" ||
      host.endsWith(".ggpht.com") ||
      host.endsWith(".googleusercontent.com") ||
      host.endsWith(".googleusercontent.com.ph") ||
      host.includes("tiktokcdn") ||
      host.includes("tiktokv") ||
      host.includes("muscdn") ||
      host.includes("musical.ly") ||
      host.includes("ibytedtos") ||
      host.includes("byteoversea") ||
      host.includes("byteimg") ||
      host.includes("bytednsdoc") ||
      host.startsWith("p16-sign") ||
      host.startsWith("p19-sign") ||
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

  const audioSource = text(config.src) || text(config.url) || text(state.src);

  useEffect(() => {
    if (widget.type === "SOUND_WIDGET" && state.playing && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play();
    }
  }, [widget.type, state.playing, state.lastTriggeredAt]);

  const body = useMemo(() => {
    switch (widget.type) {
      case "ALERT_WIDGET":
        return <AlertWidget widget={widget} />;
      case "TTS_WIDGET":
        return <StatusWidget label="TTS" value={state.speaking ? "กำลังพูด" : `คิว ${number(state.queueLength, 0)}`} />;
      case "GOAL_WIDGET":
        return <GoalWidget widget={widget} />;
      case "EVENT_LIST_WIDGET":
        return <EventListWidget widget={widget} />;
      case "CHAT_WIDGET":
        return <ChatWidget widget={widget} chatMessages={chatMessages} />;
      case "IMAGE_WIDGET":
        return <ImageWidget widget={widget} />;
      case "SOUND_WIDGET":
        return <StatusWidget label="Sound" value={state.playing ? "playing" : "ready"} />;
      case "TEXT_WIDGET":
        return <TextWidget widget={widget} />;
      default:
        return <StatusWidget label={widget.type} value={widget.name} />;
    }
  }, [widget, state, chatMessages]);

  return (
    <section className="absolute overflow-hidden rounded-none text-white shadow-lg ring-1 ring-white/10" style={style}>
      {body}
      {widget.type === "SOUND_WIDGET" && audioSource ? <audio ref={audioRef} src={audioSource} preload="auto" /> : null}
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
  const message = text(state.renderedText) || text((state.lastAction as Record<string, unknown> | undefined)?.renderedText) || text(config.template, widget.name);
  return (
    <div className="flex h-full items-center gap-4 bg-black/70 p-5 border-l-4 border-primary">
      <div>
        <p className="mb-1 text-xs font-semibold text-ink-subtle">Alert</p>
        <p className="text-3xl font-black leading-tight text-white">{message}</p>
      </div>
    </div>
  );
}

function GoalWidget({ widget }: { widget: OverlayWidget }) {
  const state = widget.state?.state ?? {};
  const config = widget.config ?? {};
  const current = number(state.current, 0);
  const target = number(state.target, number(config.target, 100));
  const progress = Math.max(0, Math.min(100, (current / target) * 100));
  return (
    <div className="flex h-full flex-col justify-center bg-black/70 p-5">
      <div className="mb-3 flex justify-between text-xs font-semibold text-white"><span>{text(config.label, "Goal")}</span><span className="text-primary">{current}/{target}</span></div>
      <div className="h-6 rounded-none bg-surface-base/50"><div className="h-full rounded-none bg-primary transition-all duration-500 ease-out" style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

function EventListWidget({ widget }: { widget: OverlayWidget }) {
  const items = Array.isArray(widget.state?.state?.items) ? widget.state?.state?.items.slice(0, 8) : [];
  return (
    <div className="h-full space-y-3 overflow-hidden bg-black/70 p-4">
      <p className="mb-2 text-xs font-semibold text-ink-subtle">Recent Events</p>
      {items.map((item, index) => <p key={index} className="truncate rounded-none border-l-2 border-primary bg-surface-base/40 px-3 py-2 text-xs font-bold text-white">{JSON.stringify(item)}</p>)}
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
  const animateMessages = bool(config.animateMessages, true);
  const compactMode = bool(config.compactMode, false);
  const textShadow = bool(config.textShadow, true);
  const order = choice(config.order, ["newest-bottom", "newest-top"] as const, "newest-bottom");
  const align = choice(config.align, ["left", "right"] as const, "left");
  const fontFamily = choice(config.fontFamily, ["system", "mono"] as const, "system");
  const bubbleStyle = choice(config.bubbleStyle, ["solid", "glass", "outline", "minimal"] as const, "glass");
  const backgroundColor = color(config.backgroundColor, "#000000");
  const bubbleColor = color(config.bubbleColor, "#000000");
  const textColor = color(config.textColor, "#ffffff");
  const youtubeNameColor = color(config.youtubeNameColor, "#fca5a5");
  const tiktokNameColor = color(config.tiktokNameColor, "#f9a8d4");
  const backgroundOpacity = clamp(number(config.backgroundOpacity, 0), 0, 1);
  const bubbleOpacity = clamp(number(config.bubbleOpacity, 0.55), 0, 1);
  const borderOpacity = clamp(number(config.borderOpacity, 0.1), 0, 1);
  const fontSize = clamp(number(config.fontSize, 15), 10, 36);
  const nameFontSize = clamp(number(config.nameFontSize, 13), 10, 28);
  const avatarSize = clamp(number(config.avatarSize, 32), 18, 80);
  const padding = clamp(number(config.padding, 12), 0, 40);
  const gap = clamp(number(config.gap, 8), 0, 28);
  const borderRadius = clamp(number(config.borderRadius, 6), 0, 32);
  const messagePaddingX = clamp(number(config.messagePaddingX, 12), 4, 32);
  const messagePaddingY = clamp(number(config.messagePaddingY, 8), 2, 24);
  const displayMessages = [...visibleMessages].reverse();
  const listDirection = order === "newest-top" ? "flex-col" : "flex-col-reverse";
  const containerStyle: CSSProperties = { backgroundColor: rgba(backgroundColor, backgroundOpacity), padding };
  const bubbleCss: CSSProperties = {
    borderRadius,
    color: textColor,
    fontSize,
    padding: `${messagePaddingY}px ${messagePaddingX}px`,
    border: bubbleStyle === "outline" ? `1px solid ${rgba(textColor, Math.max(borderOpacity, 0.2))}` : bubbleStyle === "minimal" ? "none" : `1px solid ${rgba("#ffffff", borderOpacity)}`,
    backgroundColor: bubbleStyle === "minimal" ? "transparent" : rgba(bubbleColor, bubbleStyle === "outline" ? Math.min(bubbleOpacity, 0.18) : bubbleOpacity),
    backdropFilter: bubbleStyle === "glass" ? "blur(8px)" : undefined
  };

  return (
    <div className={`flex h-full flex-col justify-end overflow-hidden bg-transparent ${fontFamily === "mono" ? "font-mono" : ""}`} style={containerStyle}>
      <div className={`flex min-h-0 ${listDirection} overflow-y-auto pr-1 scrollbar-hide`} style={{ gap }}>
        {visibleMessages.length === 0 && showEmptyState ? (
          <div className="rounded-none border-2 border-border-base bg-surface-base px-4 py-3 text-xs font-semibold text-ink-subtle">
            รอข้อความแชท...
          </div>
        ) : (
          displayMessages.map((msg) => (
            <div key={msg.id} className={`flex items-start gap-2 ${align === "right" ? "flex-row-reverse" : ""} ${animateMessages ? "animate-[fadeIn_0.24s_ease-out]" : ""}`}>
              {showAvatar ? (
                <div className="relative mt-0.5 flex-shrink-0" style={{ height: avatarSize, width: avatarSize }}>
                  {msg.avatarUrl ? (
                    <img src={msg.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full rounded-full object-cover ring-2 ring-white/15" />
                  ) : (
                    <span className={`flex h-full w-full items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-white/15 ${msg.platform === "tiktok" ? "bg-rose-600" : "bg-red-600"}`}>
                      {msg.platform === "tiktok" ? "T" : "Y"}
                    </span>
                  )}
                </div>
              ) : null}
              <div className={`min-w-0 max-w-full shadow-md ${align === "right" ? "text-right" : ""}`} style={bubbleCss}>
                {(showPlatformLogo || showName) && !compactMode ? (
                  <div className={`mb-0.5 flex min-w-0 items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
                    {showPlatformLogo ? (
                      msg.platform === "tiktok" ? (
                        <TiktokIcon className="h-4 w-4 flex-shrink-0 drop-shadow-sm" />
                      ) : (
                        <YoutubeIcon className="h-5 w-5 flex-shrink-0 drop-shadow-sm" />
                      )
                    ) : null}
                    {showName ? (
                      <span className="truncate font-bold leading-tight" style={{ color: msg.platform === "tiktok" ? tiktokNameColor : youtubeNameColor, fontSize: nameFontSize }}>
                        {msg.displayName}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <p className={`break-words font-medium leading-snug ${textShadow ? "[text-shadow:0_1px_1px_rgba(0,0,0,0.55)]" : ""}`}>
                  {renderChatMessageText(msg.message)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ImageWidget({ widget }: { widget: OverlayWidget }) {
  const src = text(widget.config.src) || text(widget.config.url) || text(widget.state?.state?.src);
  return src ? <img src={src} alt={widget.name} className="h-full w-full object-contain" /> : <StatusWidget label="Image" value="ยังไม่มีรูป" />;
}

function TextWidget({ widget }: { widget: OverlayWidget }) {
  const value = text(widget.state?.state?.text) || text(widget.config.text, widget.name);
  const fontSize = number(widget.config.fontSize, 28);
  return <div className="flex h-full items-center bg-black/70 p-4 font-black" style={{ fontSize }}>{value}</div>;
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" overflow="visible">
      <title>YouTube</title>
      <path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
      <path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function TiktokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 448 512" className={className} aria-hidden="true" overflow="visible">
      <title>TikTok</title>
      <path fill="#24f6f0" d="M380.9 97.1C339 97.1 320.3 83.2 320.3 64.1v-6.9h-73.4v333.1c0 41.6-33.8 75.3-75.3 75.3s-75.3-33.8-75.3-75.3 33.8-75.3 75.3-75.3c10.4 0 20.3 2.1 29.3 5.9v-79.6c-9.4-2.3-19.2-3.6-29.3-3.6-81.8 0-148.1 66.3-148.1 148.1S89.5 456 171.3 456s148.1-66.3 148.1-148.1V191.7c31.3 24.3 71.1 38.6 114.1 38.6v-75.8c-18.7 0-36.6-4.9-52.6-13.7z" />
      <path fill="#ff0050" d="M394.3 103.5C352.4 103.5 333.7 89.6 333.7 70.5v-6.9h-73.4v333.1c0 41.6-33.8 75.3-75.3 75.3s-75.3-33.8-75.3-75.3 33.8-75.3 75.3-75.3c10.4 0 20.3 2.1 29.3 5.9v-79.6c-9.4-2.3-19.2-3.6-29.3-3.6-81.8 0-148.1 66.3-148.1 148.1S102.9 462.4 184.7 462.4s148.1-66.3 148.1-148.1V198.1c31.3 24.3 71.1 38.6 114.1 38.6v-75.8c-18.7 0-36.6-4.9-52.6-13.7z" />
      <path fill="#ffffff" d="M387.6 100.3C345.7 100.3 327 86.4 327 67.3v-6.9h-73.4v333.1c0 41.6-33.8 75.3-75.3 75.3s-75.3-33.8-75.3-75.3 33.8-75.3 75.3-75.3c10.4 0 20.3 2.1 29.3 5.9v-79.6c-9.4-2.3-19.2-3.6-29.3-3.6-81.8 0-148.1 66.3-148.1 148.1S96.2 459.2 178 459.2s148.1-66.3 148.1-148.1V194.9c31.3 24.3 71.1 38.6 114.1 38.6v-75.8c-18.7 0-36.6-4.9-52.6-13.7z" />
    </svg>
  );
}
