"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { WidgetRenderer, type OverlayWidget } from "../../../components/widget-renderer";
import { API_URL } from "../../../lib/api";

type OverlayState = { overlay: { width: number; height: number; token: string }; widgets: OverlayWidget[] };

export default function OverlayPage() {
  const { overlayToken } = useParams<{ overlayToken: string }>();
  const [state, setState] = useState<OverlayState>();
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/public/overlay/${overlayToken}/state`).then((res) => res.json()).then(setState);
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL, { transports: ["websocket"] });
    socket.on("connect", () => socket.emit("overlay.join", { token: overlayToken }));
    for (const event of ["widget.triggered", "widget.completed", "tts.queued", "tts.speak", "tts.completed", "goal.updated", "event.list.appended"]) {
      socket.on(event, (payload) => {
        setEvents((items) => [`${event}: ${JSON.stringify(payload)}`, ...items].slice(0, 8));
        if (event === "tts.speak" && typeof window !== "undefined" && "speechSynthesis" in window) {
          const text = payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string" ? payload.text : "";
          if (text) window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
        }
        fetch(`${API_URL}/public/overlay/${overlayToken}/state`).then((res) => res.json()).then(setState);
      });
    }
    return () => {
      socket.close();
    };
  }, [overlayToken]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-transparent text-white">
      {state?.widgets.map((widget) => (
        <WidgetRenderer key={widget.id} widget={widget} />
      ))}
      <aside className="absolute bottom-4 left-4 max-w-xl space-y-1 text-xs">{events.map((event, index) => <p key={index} className="rounded bg-black/60 px-2 py-1">{event}</p>)}</aside>
    </main>
  );
}
