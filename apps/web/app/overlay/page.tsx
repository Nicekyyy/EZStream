"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";
import { io } from "socket.io-client";
import { Rnd } from "react-rnd";
import { WidgetRenderer, type OverlayWidget } from "../../components/widget-renderer";
import { API_URL } from "../../lib/api";
import type { UnifiedChatMessage } from "@ezstream/shared";

type OverlayState = {
  overlay: { width: number; height: number; token: string };
  widgets: OverlayWidget[];
  chatMessages?: UnifiedChatMessage[];
};
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

function mergeChatMessages(current: UnifiedChatMessage[], incoming: UnifiedChatMessage[]) {
  const byId = new Map<string, UnifiedChatMessage>();
  for (const item of [...current, ...incoming]) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-50);
}

function OverlayContent() {
  const searchParams = useSearchParams();
  const overlayToken = searchParams.get("token") ?? "";
  const [state, setState] = useState<OverlayState>();
  const [events, setEvents] = useState<string[]>([]);
  const [debug, setDebug] = useState(false);
  const isEditor = searchParams.get("editor") === "true";
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, widgetId: string, zIndex: number } | null>(null);
  const ttsQueue = useRef<TtsPayload[]>([]);
  const isSpeaking = useRef(false);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const [chatMessages, setChatMessages] = useState<UnifiedChatMessage[]>([]);
  const guidesRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const snappedPos = useRef<{ x: number | null, y: number | null }>({ x: null, y: null });
  const [snapEnabled, setSnapEnabled] = useState(true);

  const calculateAndRenderGuides = (
    activeRect: { x: number, y: number, w: number, h: number }, 
    activeId: string,
    node?: HTMLElement
  ) => {
    if (!guidesRef.current || !state || !containerRef.current) return;
    
    const threshold = 15;
    const container = containerRef.current.getBoundingClientRect();
    
    const ax = Math.round(activeRect.x);
    const ay = Math.round(activeRect.y);
    const aw = Math.round(activeRect.w);
    const ah = Math.round(activeRect.h);

    const activePointsX = [
      { offset: 0, val: ax },
      { offset: Math.round(aw / 2), val: ax + Math.round(aw / 2) },
      { offset: aw, val: ax + aw }
    ];
    const activePointsY = [
      { offset: 0, val: ay },
      { offset: Math.round(ah / 2), val: ay + Math.round(ah / 2) },
      { offset: ah, val: ay + ah }
    ];

    const targetPointsX: { val: number, source: 'screen' | 'widget' }[] = [
      { val: Math.round(container.width / 2), source: 'screen' }
    ];
    const targetPointsY: { val: number, source: 'screen' | 'widget' }[] = [
      { val: Math.round(container.height / 2), source: 'screen' }
    ];

    for (const w of state.widgets) {
      if (w.id === activeId || !w.visibility) continue;
      targetPointsX.push({ val: Math.round(w.positionX), source: 'widget' });
      targetPointsX.push({ val: Math.round(w.positionX + w.width / 2), source: 'widget' });
      targetPointsX.push({ val: Math.round(w.positionX + w.width), source: 'widget' });
      
      targetPointsY.push({ val: Math.round(w.positionY), source: 'widget' });
      targetPointsY.push({ val: Math.round(w.positionY + w.height / 2), source: 'widget' });
      targetPointsY.push({ val: Math.round(w.positionY + w.height), source: 'widget' });
    }

    let snapX: number | null = null;
    let snapY: number | null = null;
    let minDiffX = threshold;
    let minDiffY = threshold;

    for (const a of activePointsX) {
      for (const t of targetPointsX) {
        const diff = Math.abs(a.val - t.val);
        if (diff < minDiffX) {
          minDiffX = diff;
          snapX = t.val - a.offset;
        }
      }
    }

    for (const a of activePointsY) {
      for (const t of targetPointsY) {
        const diff = Math.abs(a.val - t.val);
        if (diff < minDiffY) {
          minDiffY = diff;
          snapY = t.val - a.offset;
        }
      }
    }

    const finalX = (snapEnabled && snapX !== null) ? snapX : ax;
    const finalY = (snapEnabled && snapY !== null) ? snapY : ay;

    const effectivePointsX = [
      finalX,
      finalX + Math.round(aw / 2),
      finalX + aw
    ];
    const effectivePointsY = [
      finalY,
      finalY + Math.round(ah / 2),
      finalY + ah
    ];

    const guides: { type: 'horizontal' | 'vertical', pos: number, source: 'screen' | 'widget' }[] = [];

    for (const a of effectivePointsX) {
      for (const t of targetPointsX) {
        const diff = Math.abs(a - t.val);
        if (diff < (snapEnabled ? 1 : threshold)) {
          guides.push({ type: 'vertical', pos: t.val, source: t.source });
        }
      }
    }

    for (const a of effectivePointsY) {
      for (const t of targetPointsY) {
        const diff = Math.abs(a - t.val);
        if (diff < (snapEnabled ? 1 : threshold)) {
          guides.push({ type: 'horizontal', pos: t.val, source: t.source });
        }
      }
    }

    const uniqueGuides = new Map<string, any>();
    for (const g of guides) {
      const key = `${g.type}-${g.pos}`;
      if (!uniqueGuides.has(key) || g.source === 'screen') {
        uniqueGuides.set(key, g);
      }
    }

    let html = '';
    for (const g of uniqueGuides.values()) {
      const style = g.source === 'screen' ? 'solid' : 'dashed';
      if (g.type === 'vertical') {
        html += `<div style="position: absolute; left: ${g.pos}px; top: 0; bottom: 0; width: 1px; border-left: 1px ${style} #06b6d4; box-shadow: 0 0 4px #06b6d4;"></div>`;
      } else {
        html += `<div style="position: absolute; top: ${g.pos}px; left: 0; right: 0; height: 1px; border-top: 1px ${style} #06b6d4; box-shadow: 0 0 4px #06b6d4;"></div>`;
      }
    }
    guidesRef.current.innerHTML = html;

    if (node) {
      if (snapEnabled) {
        snappedPos.current = { x: snapX, y: snapY };
        const renderX = snapX !== null ? snapX : activeRect.x;
        const renderY = snapY !== null ? snapY : activeRect.y;
        
        const offsetX = renderX - activeRect.x;
        const offsetY = renderY - activeRect.y;
        node.style.translate = `${offsetX}px ${offsetY}px`;
      } else {
        snappedPos.current = { x: null, y: null };
        node.style.translate = `0px 0px`;
      }
    }
  };

  const clearGuides = () => {
    if (guidesRef.current) guidesRef.current.innerHTML = '';
    snappedPos.current = { x: null, y: null };
  };

  const handleContextMenu = (e: React.MouseEvent, widgetId: string, zIndex: number) => {
    if (!isEditor) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, widgetId, zIndex });
  };

  const handleUpdateZIndex = (widgetId: string, currentZIndex: number, delta: number) => {
    const nextZIndex = Math.max(0, currentZIndex + delta);
    window.parent.postMessage({ type: "WIDGET_UPDATE", id: widgetId, updates: { zIndex: nextZIndex } }, "*");
    setContextMenu(null);
  };

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
    const handleSnapMessage = (event: MessageEvent) => {
      if (event.data?.type === "SET_SNAP_ENABLED" && typeof event.data.enabled === "boolean") {
        setSnapEnabled(event.data.enabled);
      }
    };
    window.addEventListener("message", handleSnapMessage);
    return () => window.removeEventListener("message", handleSnapMessage);
  }, []);

  useEffect(() => {
    if (!overlayToken) return;

    const shouldDebug = window.location.pathname.includes("/preview") || new URLSearchParams(window.location.search).get("debug") === "1";
    setDebug(shouldDebug);
    const loadState = () =>
      fetch(`${API_URL}/public/overlay/${overlayToken}/state?_t=${Date.now()}`, { cache: "no-store" })
        .then((res) => {
          if (res.status === 404) return null;
          if (!res.ok) throw new Error(`Network response was not ok: ${res.status} ${res.statusText}`);
          return res.json();
        })
        .then((nextState: OverlayState | null) => {
          if (!nextState) {
            setState(undefined);
            return;
          }
          setState(nextState);
          if (nextState.chatMessages?.length) {
            setChatMessages((prev) => mergeChatMessages(prev, nextState.chatMessages ?? []));
          }
        })
        .catch((err) => console.error("Overlay fetch error:", err));

    void loadState();
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL, { transports: ["websocket"] });

    const joinRoom = () => {
      socket.emit("overlay.join", { token: overlayToken });
      void loadState();
    };
    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);

    for (const event of ["widget.updated", "widget.triggered", "widget.completed", "tts.queued", "tts.speak", "tts.completed", "goal.updated", "event.list.appended"]) {
      socket.on(event, (payload) => {
        if (shouldDebug) setEvents((items) => [`${event}: ${JSON.stringify(payload)}`, ...items].slice(0, 8));
        if (event === "tts.speak") enqueueTts(payload);
        void loadState();
      });
    }
    socket.on("chat.message", (payload: UnifiedChatMessage) => {
      setChatMessages((prev) => mergeChatMessages(prev, [payload]));
      if (shouldDebug) setEvents((items) => [`chat.message: ${payload.displayName}: ${payload.message}`, ...items].slice(0, 8));
    });
    return () => {
      socket.close();
      ttsQueue.current = [];
      isSpeaking.current = false;
      currentAudio.current?.pause();
      currentAudio.current = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [overlayToken]);

  const chroma = searchParams.get("chroma") === "true" || searchParams.get("bg") === "green";

  return (
    <main
      ref={containerRef}
      className="relative min-h-screen overflow-hidden text-white"
      style={{ backgroundColor: chroma ? "#00FF00" : "transparent" }}
      onClick={() => setContextMenu(null)}
    >
      <div ref={guidesRef} className="pointer-events-none absolute inset-0 z-[9999]" />
      {state?.widgets.map((widget) => {
        if (isEditor) {
          return (
            <Rnd
              key={widget.id}
              size={{ width: widget.width, height: widget.height }}
              position={{ x: widget.positionX, y: widget.positionY }}
              maxWidth={state.overlay?.width ?? 1920}
              maxHeight={state.overlay?.height ?? 1080}
              onDrag={(e, d) => {
                calculateAndRenderGuides({ x: d.x, y: d.y, w: widget.width, h: widget.height }, widget.id, d.node);
              }}
              onDragStop={(e, d) => {
                const finalX = snappedPos.current.x !== null ? snappedPos.current.x : d.x;
                const finalY = snappedPos.current.y !== null ? snappedPos.current.y : d.y;
                clearGuides();
                if (d.node) d.node.style.translate = '0px 0px';
                
                setState(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    widgets: prev.widgets.map(w => w.id === widget.id ? { ...w, positionX: Math.round(finalX), positionY: Math.round(finalY) } : w)
                  };
                });

                window.parent.postMessage({ type: "WIDGET_UPDATE", id: widget.id, updates: { positionX: Math.round(finalX), positionY: Math.round(finalY) } }, "*");
              }}
              onResize={(e, dir, ref, delta, position) => {
                const w = parseInt(ref.style.width, 10) || widget.width;
                const h = parseInt(ref.style.height, 10) || widget.height;
                calculateAndRenderGuides({ x: position.x, y: position.y, w, h }, widget.id);
              }}
              onResizeStop={(e, dir, ref, delta, position) => {
                clearGuides();
                const finalW = Math.round(parseInt(ref.style.width, 10));
                const finalH = Math.round(parseInt(ref.style.height, 10));
                const finalX = Math.round(position.x);
                const finalY = Math.round(position.y);

                setState(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    widgets: prev.widgets.map(w => w.id === widget.id ? { ...w, positionX: finalX, positionY: finalY, width: finalW, height: finalH } : w)
                  };
                });

                window.parent.postMessage({
                  type: "WIDGET_UPDATE",
                  id: widget.id,
                  updates: {
                    width: finalW,
                    height: finalH,
                    positionX: finalX,
                    positionY: finalY,
                  }
                }, "*");
              }}
              onContextMenu={(e: any) => handleContextMenu(e, widget.id, widget.zIndex)}
              bounds="parent"
              className={`group absolute hover:ring-2 hover:ring-indigo-500 hover:bg-indigo-500/10 transition-colors ${!widget.visibility && 'opacity-50'}`}
              style={{ zIndex: widget.zIndex }}
            >
              <div className="w-full h-full pointer-events-none opacity-90">
                <WidgetRenderer widget={{ ...widget, positionX: 0, positionY: 0 }} chatMessages={chatMessages} />
              </div>
            </Rnd>
          );
        }
        return <WidgetRenderer key={widget.id} widget={widget} chatMessages={chatMessages} />;
      })}
      {debug ? <aside className="absolute bottom-4 left-4 max-w-xl space-y-1 text-xs">{events.map((event, index) => <p key={index} className="rounded bg-black/60 px-2 py-1">{event}</p>)}</aside> : null}

      {contextMenu && (
        <div
          className="fixed z-[9999] bg-slate-900 border border-slate-700 rounded-md shadow-xl py-1 text-sm text-slate-200 min-w-40"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-800"
            onClick={(e) => { e.stopPropagation(); handleUpdateZIndex(contextMenu.widgetId, contextMenu.zIndex, 1); }}
          >
            นำมาไว้ข้างหน้าสุด (Bring Forward)
          </button>
          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-800"
            onClick={(e) => { e.stopPropagation(); handleUpdateZIndex(contextMenu.widgetId, contextMenu.zIndex, -1); }}
          >
            ส่งไปไว้ข้างหลัง (Send Backward)
          </button>
          <div className="h-px bg-slate-800 my-1" />
          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-800 text-indigo-400 font-medium"
            onClick={(e) => {
              e.stopPropagation();
              window.parent.postMessage({ type: "NAVIGATE", url: `/dashboard/widgets/edit?id=${contextMenu.widgetId}` }, "*");
              setContextMenu(null);
            }}
          >
            แก้ไข Widget...
          </button>
        </div>
      )}
    </main>
  );
}

export default function OverlayPage() {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-white">กำลังโหลด Overlay...</div>}>
      <OverlayContent />
    </Suspense>
  );
}
