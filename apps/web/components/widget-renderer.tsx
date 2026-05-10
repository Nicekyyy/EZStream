"use client";

import { useEffect, useMemo, useRef } from "react";

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

export function WidgetRenderer({ widget }: { widget: OverlayWidget }) {
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
        return <ChatWidget widget={widget} />;
      case "IMAGE_WIDGET":
        return <ImageWidget widget={widget} />;
      case "SOUND_WIDGET":
        return <StatusWidget label="Sound" value={state.playing ? "playing" : "ready"} />;
      case "TEXT_WIDGET":
        return <TextWidget widget={widget} />;
      default:
        return <StatusWidget label={widget.type} value={widget.name} />;
    }
  }, [widget, state]);

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
      <div className="h-4 rounded bg-white/20"><div className="h-4 rounded bg-emerald-400" style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

function EventListWidget({ widget }: { widget: OverlayWidget }) {
  const items = Array.isArray(widget.state?.state?.items) ? widget.state?.state?.items.slice(0, 8) : [];
  return (
    <div className="h-full space-y-2 overflow-hidden p-3">
      <p className="text-sm font-medium text-white/70">Recent Events</p>
      {items.map((item, index) => <p key={index} className="truncate rounded bg-white/10 px-2 py-1 text-sm">{JSON.stringify(item)}</p>)}
    </div>
  );
}

function ChatWidget({ widget }: { widget: OverlayWidget }) {
  const state = widget.state?.state ?? {};
  return (
    <div className="h-full p-3">
      <p className="text-sm text-white/60">Chat</p>
      <p className="text-lg">{text(state.message) || text((state.lastAction as Record<string, unknown> | undefined)?.renderedText, "รอข้อความ")}</p>
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
