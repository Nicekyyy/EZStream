"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { UnifiedChatMessage } from "@ezstream/shared";
import { WidgetRenderer, type OverlayWidget } from "../../../components/widget-renderer";
import { API_URL } from "../../../lib/api";

type WidgetState = {
  overlay: { id: string; name: string; token: string; width: number; height: number };
  widget: OverlayWidget;
  chatMessages?: UnifiedChatMessage[];
};
type TtsPayload = { widgetId?: string; ttsJobId?: string; text: string; voice: string; speed: number; pitch: number; volume: number; audioUrl?: string };

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numeric));
}

function parseTtsPayload(payload: unknown): TtsPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  if (typeof value.text !== "string" || !value.text.trim()) return null;
  return {
    widgetId: typeof value.widgetId === "string" ? value.widgetId : undefined,
    ttsJobId: typeof value.ttsJobId === "string" ? value.ttsJobId : undefined,
    text: value.text,
    voice: typeof value.voice === "string" ? value.voice : "default",
    speed: numberInRange(value.speed, 1, 0.5, 2),
    pitch: numberInRange(value.pitch, 1, 0, 2),
    volume: numberInRange(value.volume, 1, 0, 1),
    audioUrl: typeof value.audioUrl === "string" ? value.audioUrl : undefined
  };
}

function selectVoice(preference: string) {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length || preference === "default") return undefined;
  return voices.find((voice) => voice.name === preference || voice.voiceURI === preference);
}

function mergeChatMessages(current: UnifiedChatMessage[], incoming: UnifiedChatMessage[]) {
  const byId = new Map<string, UnifiedChatMessage>();
  for (const item of [...current, ...incoming]) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-50);
}

function payloadWidgetId(payload: unknown) {
  return payload && typeof payload === "object" && "widgetId" in payload && typeof (payload as { widgetId?: unknown }).widgetId === "string"
    ? (payload as { widgetId: string }).widgetId
    : undefined;
}

export default function SingleWidgetPage() {
  const { widgetId } = useParams<{ widgetId: string }>();
  const [state, setState] = useState<WidgetState>();
  const [events, setEvents] = useState<string[]>([]);
  const [debug, setDebug] = useState(false);
  const [chatMessages, setChatMessages] = useState<UnifiedChatMessage[]>([]);
  const ttsQueue = useRef<TtsPayload[]>([]);
  const isSpeaking = useRef(false);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  function speakNext() {
    if (isSpeaking.current || typeof window === "undefined") return;
    const next = ttsQueue.current.shift();
    if (!next) return;

    if (next.audioUrl) {
      const audio = new Audio(next.audioUrl);
      currentAudio.current = audio;
      audio.volume = next.volume;
      const finish = () => {
        currentAudio.current = null;
        isSpeaking.current = false;
        speakNext();
      };
      isSpeaking.current = true;
      audio.onended = finish;
      audio.onerror = finish;
      void audio.play().catch(finish);
      return;
    }

    if (!("speechSynthesis" in window)) {
      isSpeaking.current = false;
      speakNext();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(next.text);
    utterance.rate = next.speed;
    utterance.pitch = next.pitch;
    utterance.volume = next.volume;
    const voice = selectVoice(next.voice);
    if (voice) utterance.voice = voice;

    const finish = () => {
      isSpeaking.current = false;
      speakNext();
    };
    isSpeaking.current = true;
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  function enqueueTts(payload: unknown) {
    const next = parseTtsPayload(payload);
    if (!next || (next.widgetId && next.widgetId !== widgetId)) return;
    ttsQueue.current.push(next);
    speakNext();
  }

  useEffect(() => {
    const shouldDebug = new URLSearchParams(window.location.search).get("debug") === "1";
    setDebug(shouldDebug);

    const loadState = () =>
      fetch(`${API_URL}/public/widget/${widgetId}/state?_t=${Date.now()}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((nextState: WidgetState) => {
          setState(nextState);
          if (nextState.chatMessages?.length) {
            setChatMessages((prev) => mergeChatMessages(prev, nextState.chatMessages ?? []));
          }
          return nextState;
        });

    let active = true;
    void loadState().then((nextState) => {
      if (!active) return;
      const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL, { transports: ["websocket"] });
      socketRef.current = socket;
      
      const joinRoom = () => socket.emit("overlay.join", { token: nextState.overlay.token, widgetId });
      if (socket.connected) joinRoom();
      socket.on("connect", joinRoom);
      
      for (const event of ["widget.updated", "widget.triggered", "widget.completed", "tts.queued", "tts.speak", "tts.completed", "goal.updated", "event.list.appended"]) {
        socket.on(event, (payload) => {
          const targetWidgetId = payloadWidgetId(payload);
          if (targetWidgetId && targetWidgetId !== widgetId) return;
          if (shouldDebug) setEvents((items) => [`${event}: ${JSON.stringify(payload)}`, ...items].slice(0, 8));
          if (event === "tts.speak") enqueueTts(payload);
          void loadState();
        });
      }
      socket.on("chat.message", (payload: UnifiedChatMessage) => {
        setChatMessages((prev) => mergeChatMessages(prev, [payload]));
        if (shouldDebug) setEvents((items) => [`chat.message: ${payload.displayName}: ${payload.message}`, ...items].slice(0, 8));
      });
    });

    return () => {
      active = false;
      socketRef.current?.close();
      socketRef.current = null;
      ttsQueue.current = [];
      isSpeaking.current = false;
      currentAudio.current?.pause();
      currentAudio.current = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [widgetId]);

  const widget = state?.widget ? { ...state.widget, positionX: 0, positionY: 0 } : undefined;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-transparent text-white">
      {widget ? <WidgetRenderer widget={widget} chatMessages={chatMessages} /> : null}
      {debug ? <aside className="absolute bottom-4 left-4 max-w-xl space-y-1 text-xs">{events.map((event, index) => <p key={index} className="rounded bg-black/60 px-2 py-1">{event}</p>)}</aside> : null}
    </main>
  );
}
