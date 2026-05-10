"use client";

import { useEffect, useMemo, useRef } from "react";
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

export function WidgetRenderer({ widget, chatMessages = [] }: { widget: OverlayWidget; chatMessages?: UnifiedChatMessage[] }) {
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
    <section className="absolute overflow-hidden rounded-md bg-black/70 text-white shadow-lg ring-1 ring-white/10" style={style}>
      {body}
      {widget.type === "SOUND_WIDGET" && audioSource ? <audio ref={audioRef} src={audioSource} preload="auto" /> : null}
    </section>
  );
}

function StatusWidget({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-full flex-col justify-center p-3">
      <p className="text-xs uppercase tracking-normal text-white/60">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function AlertWidget({ widget }: { widget: OverlayWidget }) {
  const state = widget.state?.state ?? {};
  const config = widget.config ?? {};
  const message = text(state.renderedText) || text((state.lastAction as Record<string, unknown> | undefined)?.renderedText) || text(config.template, widget.name);
  return (
    <div className="flex h-full items-center gap-3 p-4">
      <div className="h-12 w-1 rounded bg-emerald-400" />
      <div>
        <p className="text-sm text-white/60">Alert</p>
        <p className="text-2xl font-semibold leading-tight">{message}</p>
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
    <div className="flex h-full flex-col justify-center p-4">
      <div className="mb-2 flex justify-between text-sm"><span>{text(config.label, "Goal")}</span><span>{current}/{target}</span></div>
      <div className="h-4 rounded bg-slate-900/20"><div className="h-4 rounded bg-emerald-400" style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

function EventListWidget({ widget }: { widget: OverlayWidget }) {
  const items = Array.isArray(widget.state?.state?.items) ? widget.state?.state?.items.slice(0, 8) : [];
  return (
    <div className="h-full space-y-2 overflow-hidden p-3">
      <p className="text-sm font-medium text-white/70">Recent Events</p>
      {items.map((item, index) => <p key={index} className="truncate rounded bg-slate-900/10 px-2 py-1 text-sm">{JSON.stringify(item)}</p>)}
    </div>
  );
}

function ChatWidget({ widget, chatMessages }: { widget: OverlayWidget; chatMessages: UnifiedChatMessage[] }) {
  const config = widget.config ?? {};
  const maxMessages = Math.max(1, Math.min(20, number(config.maxMessages, 8)));
  const showPlatformLogo = config.showPlatformLogo !== false;
  const visibleMessages = chatMessages.slice(-maxMessages);

  return (
    <div className="flex h-full flex-col justify-end overflow-hidden bg-transparent p-3">
      <div className="flex min-h-0 flex-col-reverse gap-2 overflow-y-auto pr-1 scrollbar-hide">
        {visibleMessages.length === 0 ? (
          <div className="rounded-md bg-black/45 px-3 py-2 text-sm font-medium text-white/65 ring-1 ring-white/10">
            รอข้อความแชท...
          </div>
        ) : (
          [...visibleMessages].reverse().map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 animate-[fadeIn_0.24s_ease-out]">
              <div className="relative mt-0.5 h-8 w-8 flex-shrink-0">
                {msg.avatarUrl ? (
                  <img src={msg.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full object-cover ring-2 ring-white/15" />
                ) : (
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-white/15 ${
                    msg.platform === "tiktok" ? "bg-rose-600" : "bg-red-600"
                  }`}>
                    {msg.platform === "tiktok" ? "T" : "Y"}
                  </span>
                )}
              </div>
              <div className="min-w-0 max-w-full rounded-md bg-black/55 px-3 py-2 shadow-md ring-1 ring-white/10">
                <div className="mb-0.5 flex min-w-0 items-center gap-2">
                  {showPlatformLogo ? (
                    msg.platform === "tiktok" ? (
                      <TiktokIcon className="h-4 w-4 flex-shrink-0 drop-shadow-sm" />
                    ) : (
                      <YoutubeIcon className="h-5 w-5 flex-shrink-0 drop-shadow-sm" />
                    )
                  ) : null}
                  <span className={`truncate text-[13px] font-bold leading-tight ${
                    msg.platform === "tiktok" ? "text-rose-300" : "text-red-300"
                  }`}>
                    {msg.displayName}
                  </span>
                </div>
                <p className="break-words text-[15px] font-medium leading-snug text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.55)]">
                  {msg.message}
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
  return <div className="flex h-full items-center p-3 font-semibold" style={{ fontSize }}>{value}</div>;
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" title="YouTube" overflow="visible">
      <path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
      <path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function TiktokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 448 512" className={className} aria-hidden="true" title="TikTok" overflow="visible">
      <path fill="#24f6f0" d="M380.9 97.1C339 97.1 320.3 83.2 320.3 64.1v-6.9h-73.4v333.1c0 41.6-33.8 75.3-75.3 75.3s-75.3-33.8-75.3-75.3 33.8-75.3 75.3-75.3c10.4 0 20.3 2.1 29.3 5.9v-79.6c-9.4-2.3-19.2-3.6-29.3-3.6-81.8 0-148.1 66.3-148.1 148.1S89.5 456 171.3 456s148.1-66.3 148.1-148.1V191.7c31.3 24.3 71.1 38.6 114.1 38.6v-75.8c-18.7 0-36.6-4.9-52.6-13.7z" />
      <path fill="#ff0050" d="M394.3 103.5C352.4 103.5 333.7 89.6 333.7 70.5v-6.9h-73.4v333.1c0 41.6-33.8 75.3-75.3 75.3s-75.3-33.8-75.3-75.3 33.8-75.3 75.3-75.3c10.4 0 20.3 2.1 29.3 5.9v-79.6c-9.4-2.3-19.2-3.6-29.3-3.6-81.8 0-148.1 66.3-148.1 148.1S102.9 462.4 184.7 462.4s148.1-66.3 148.1-148.1V198.1c31.3 24.3 71.1 38.6 114.1 38.6v-75.8c-18.7 0-36.6-4.9-52.6-13.7z" />
      <path fill="#ffffff" d="M387.6 100.3C345.7 100.3 327 86.4 327 67.3v-6.9h-73.4v333.1c0 41.6-33.8 75.3-75.3 75.3s-75.3-33.8-75.3-75.3 33.8-75.3 75.3-75.3c10.4 0 20.3 2.1 29.3 5.9v-79.6c-9.4-2.3-19.2-3.6-29.3-3.6-81.8 0-148.1 66.3-148.1 148.1S96.2 459.2 178 459.2s148.1-66.3 148.1-148.1V194.9c31.3 24.3 71.1 38.6 114.1 38.6v-75.8c-18.7 0-36.6-4.9-52.6-13.7z" />
    </svg>
  );
}
