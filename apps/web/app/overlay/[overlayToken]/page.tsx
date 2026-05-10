"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { WidgetRenderer, type OverlayWidget } from "../../../components/widget-renderer";
import { API_URL } from "../../../lib/api";

type OverlayState = { overlay: { width: number; height: number; token: string }; widgets: OverlayWidget[] };
type TtsPayload = { ttsJobId?: string; text: string; voice: string; speed: number; pitch: number; volume: number; audioUrl?: string };

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numeric));
}

function parseTtsPayload(payload: unknown): TtsPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  if (typeof value.text !== "string" || !value.text.trim()) return null;
  return {
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
  if (preference === "female") {
    return (
      voices.find((voice) => /female|woman|zira|susan|aria|jenny|samantha|karen|victoria|moira|tessa|veena|lekha|google us english/i.test(`${voice.name} ${voice.voiceURI}`)) ??
      voices.find((voice) => /^en/i.test(voice.lang)) ??
      voices[0]
    );
  }
  return voices.find((voice) => voice.name === preference || voice.voiceURI === preference);
}

export default function OverlayPage() {
  const { overlayToken } = useParams<{ overlayToken: string }>();
  const [state, setState] = useState<OverlayState>();
  const [events, setEvents] = useState<string[]>([]);
  const [debug, setDebug] = useState(false);
  const ttsQueue = useRef<TtsPayload[]>([]);
  const isSpeaking = useRef(false);
  const currentAudio = useRef<HTMLAudioElement | null>(null);

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

    const selectedVoice = selectVoice(next.voice);
    if (selectedVoice) utterance.voice = selectedVoice;

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
    if (!next) return;
    ttsQueue.current.push(next);
    speakNext();
  }

  useEffect(() => {
    const shouldDebug = window.location.pathname.includes("/overlay/preview/") || new URLSearchParams(window.location.search).get("debug") === "1";
    setDebug(shouldDebug);
    const loadState = () => fetch(`${API_URL}/public/overlay/${overlayToken}/state`).then((res) => res.json()).then(setState);
    void loadState();
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL, { transports: ["websocket"] });
    socket.on("connect", () => socket.emit("overlay.join", { token: overlayToken }));
    for (const event of ["widget.triggered", "widget.completed", "tts.queued", "tts.speak", "tts.completed", "goal.updated", "event.list.appended"]) {
      socket.on(event, (payload) => {
        if (shouldDebug) setEvents((items) => [`${event}: ${JSON.stringify(payload)}`, ...items].slice(0, 8));
        if (event === "tts.speak") enqueueTts(payload);
        void loadState();
      });
    }
    return () => {
      socket.close();
      ttsQueue.current = [];
      isSpeaking.current = false;
      currentAudio.current?.pause();
      currentAudio.current = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [overlayToken]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-transparent text-white">
      {state?.widgets.map((widget) => (
        <WidgetRenderer key={widget.id} widget={widget} />
      ))}
      {debug ? <aside className="absolute bottom-4 left-4 max-w-xl space-y-1 text-xs">{events.map((event, index) => <p key={index} className="rounded bg-black/60 px-2 py-1">{event}</p>)}</aside> : null}
    </main>
  );
}
