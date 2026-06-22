"use client";

import { Button } from "@ezstream/ui";
import { defaultGoogleTtsVoiceName, googleTtsVoices, resolveGoogleTtsVoiceName } from "@ezstream/shared";
import type { GoogleTtsVoiceName } from "@ezstream/shared";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { Badge, EmptyState, Field, Input, Notice, Select, Textarea } from "../../../components/ui-kit";
import { API_URL, APP_URL, api } from "../../../lib/api";
import { copyText } from "../../../lib/clipboard";

type Overlay = { id: string; name: string; token: string };
type TtsWidget = { id: string; name: string; type: string; overlayId: string | null; isEnabled: boolean; visibility?: boolean; config?: unknown };
type TtsJob = {
  id: string;
  text: string;
  voice: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string;
  errorMessage?: string | null;
  widget?: { id: string; name: string; overlay?: { id: string; name: string; token: string } } | null;
};
type TtsPayload = { widgetId?: string; ttsJobId?: string; text: string; voice: string; speed: number; pitch: number; volume: number; audioUrl?: string };

const statusTone: Record<TtsJob["status"], "warning" | "info" | "success" | "danger"> = {
  QUEUED: "warning",
  PROCESSING: "info",
  COMPLETED: "success",
  FAILED: "danger"
};

function configObject(widget: TtsWidget | undefined) {
  return widget?.config && typeof widget.config === "object" && !Array.isArray(widget.config) ? (widget.config as Record<string, unknown>) : {};
}

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

function selectBrowserVoice(preference: string) {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length || preference === "default") return undefined;
  return voices.find((item) => item.name === preference || item.voiceURI === preference);
}

export default function TtsPage() {
  const [jobs, setJobs] = useState<TtsJob[]>([]);
  const [widgets, setWidgets] = useState<TtsWidget[]>([]);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [widgetId, setWidgetId] = useState("");
  const [voice, setVoice] = useState<GoogleTtsVoiceName>(defaultGoogleTtsVoiceName);
  const [text, setText] = useState("Hello from dashboard");
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [includeSenderName, setIncludeSenderName] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [loading, setLoading] = useState(true);
  const ttsQueue = useRef<TtsPayload[]>([]);
  const spokenTtsJobs = useRef<Set<string>>(new Set());
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
    const selectedVoice = selectBrowserVoice(next.voice);
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
    if (!next || (next.widgetId && next.widgetId !== widgetId)) return;
    if (next.ttsJobId) {
      if (spokenTtsJobs.current.has(next.ttsJobId)) return;
      spokenTtsJobs.current.add(next.ttsJobId);
    }
    ttsQueue.current.push(next);
    speakNext();
  }

  async function load() {
    const [nextJobs, nextWidgets, nextOverlays] = await Promise.all([
      api<TtsJob[]>("/tts/jobs"),
      api<TtsWidget[]>("/widgets"),
      api<Overlay[]>("/overlays")
    ]);
    const ttsWidgets = nextWidgets.filter((widget) => widget.type === "TTS_WIDGET" && widget.isEnabled);
    setJobs(nextJobs);
    setWidgets(ttsWidgets);
    setOverlays(nextOverlays);
    const nextWidgetId = widgetId || ttsWidgets[0]?.id || "";
    const nextWidget = ttsWidgets.find((widget) => widget.id === nextWidgetId) ?? ttsWidgets[0];
    const nextConfig = configObject(nextWidget);
    setWidgetId(nextWidgetId);
    setVoice(resolveGoogleTtsVoiceName(nextConfig.voice, defaultGoogleTtsVoiceName));
    setIncludeSenderName(nextConfig.includeSenderName !== false);
  }

  useEffect(() => {
    void load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดข้อมูล TTS ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!widgetId) return;
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    const joinRoom = () => socket.emit("overlay.join", { widgetId });
    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);
    socket.on("tts.speak", enqueueTts);
    socket.on("tts.completed", () => void load().catch(() => undefined));

    return () => {
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
      ttsQueue.current = [];
      isSpeaking.current = false;
      currentAudio.current?.pause();
      currentAudio.current = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [widgetId]);

  const selectedWidget = widgets.find((widget) => widget.id === widgetId);
  const selectedWidgetConfig = configObject(selectedWidget);
  const selectedOverlay = overlays.find((overlay) => overlay.id === selectedWidget?.overlayId);
  const overlayUrl = selectedOverlay && APP_URL ? `${APP_URL}/overlay?token=${selectedOverlay.token}` : "";
  const previewUrl = selectedOverlay && APP_URL ? `${APP_URL}/overlay/preview?token=${selectedOverlay.token}&debug=1` : "";
  const canSubmit = Boolean(text.trim() && widgetId && !submitting);
  const latestJobs = useMemo(() => jobs.slice(0, 20), [jobs]);

  function selectWidget(nextWidgetId: string) {
    const nextWidget = widgets.find((widget) => widget.id === nextWidgetId);
    const nextConfig = configObject(nextWidget);
    setWidgetId(nextWidgetId);
    setVoice(resolveGoogleTtsVoiceName(nextConfig.voice, defaultGoogleTtsVoiceName));
    setIncludeSenderName(nextConfig.includeSenderName !== false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      await api<TtsJob>("/tts/test", {
        method: "POST",
        body: JSON.stringify({ text: text.trim(), widgetId, voice, speed, pitch, volume })
      });
      setMessage("ส่ง TTS job แล้ว หน้าเว็บและ Widget จะเล่นเสียงเมื่อประมวลผลเสร็จ");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทดสอบ TTS ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveVoiceDefault() {
    if (!selectedWidget) return;
    setSavingVoice(true);
    setMessage("");
    setError("");
    try {
      await api<TtsWidget>(`/widgets/${selectedWidget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ config: { ...selectedWidgetConfig, voice, speed, pitch, volume, includeSenderName } })
      });
      setMessage("บันทึกค่า TTS แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกเสียงเริ่มต้นไม่สำเร็จ");
    } finally {
      setSavingVoice(false);
    }
  }

  async function copyUrl(url: string, label: string) {
    const copied = await copyText(url);
    if (copied) {
      setError("");
      setMessage(`คัดลอก${label}แล้ว`);
    } else {
      setMessage("");
      setError(`คัดลอก${label}ไม่สำเร็จ`);
    }
  }

  return (
    <DashboardShell title="TTS">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <ResourceCard>
          <form onSubmit={submit} className="grid gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">ทดสอบเสียงและค่าเริ่มต้น</h2>
              <p className="mt-1 text-sm text-slate-400">เลือก TTS widget แล้วส่งข้อความทดสอบไปยัง overlay</p>
            </div>

            <Field label="TTS Widget">
              <Select id="tts-widget" value={widgetId} onChange={(event) => selectWidget(event.target.value)} disabled={loading}>
                {widgets.length ? widgets.map((widget) => <option key={widget.id} value={widget.id}>{widget.name}</option>) : <option value="">No TTS widget</option>}
              </Select>
              {selectedWidget ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={selectedWidget.isEnabled ? "success" : "neutral"}>{selectedWidget.isEnabled ? "Widget เปิดใช้งาน" : "Widget ปิดใช้งาน"}</Badge>
                  <Badge tone={selectedWidget.visibility !== false ? "info" : "neutral"}>{selectedWidget.visibility !== false ? "แสดงบน Overlay" : "ซ่อนบน Overlay"}</Badge>
                </div>
              ) : null}
            </Field>

            <Field label="Voice">
              <Select id="tts-voice" value={voice} onChange={(event) => setVoice(resolveGoogleTtsVoiceName(event.target.value, defaultGoogleTtsVoiceName))}>
                {googleTtsVoices.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}
              </Select>
            </Field>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200">
              <span>อ่านชื่อผู้ส่งก่อนข้อความแชท</span>
              <input className="h-4 w-4 accent-indigo-500" type="checkbox" checked={includeSenderName} onChange={(event) => setIncludeSenderName(event.target.checked)} />
            </label>

            <Field label="ข้อความทดสอบ" hint={`${text.length}/300 characters`}>
              <Textarea id="tts-text" className="min-h-28" maxLength={300} value={text} onChange={(event) => setText(event.target.value)} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <RangeField label="Speed" min="0.5" max="2" step="0.1" value={speed} onChange={setSpeed} />
              <RangeField label="Pitch" min="0" max="2" step="0.1" value={pitch} onChange={setPitch} />
              <RangeField label="Volume" min="0" max="1" step="0.1" value={volume} onChange={setVolume} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button disabled={!canSubmit}>{submitting ? "Sending..." : "Test TTS"}</Button>
              <Button variant="secondary" type="button" disabled={!selectedWidget || savingVoice} onClick={() => void saveVoiceDefault()}>
                {savingVoice ? "Saving..." : "Save default"}
              </Button>
            </div>
            {message ? <Notice tone="success">{message}</Notice> : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
          </form>
        </ResourceCard>

        <ResourceCard>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-200">Overlay URL for OBS</p>
              {overlayUrl ? <p className="mt-1 break-all text-sm text-slate-400">{overlayUrl}</p> : <p className="mt-1 text-sm text-slate-500">เลือก TTS widget ก่อน</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {overlayUrl ? <Button size="sm" variant="secondary" onClick={() => void copyUrl(overlayUrl, " Overlay URL")} type="button">คัดลอก Overlay URL</Button> : null}
              {previewUrl ? (
                <>
                  <Button size="sm" variant="secondary" onClick={() => void copyUrl(previewUrl, " Preview URL")} type="button">คัดลอก Preview URL</Button>
                  <Button size="sm" variant="ghost" asChild><a href={previewUrl} target="_blank" rel="noreferrer">Open preview</a></Button>
                </>
              ) : null}
            </div>
            <p className="text-sm leading-6 text-slate-400">Google Cloud Text-to-Speech สร้าง MP3 แล้วให้เครื่องที่เปิด overlay เล่นเสียงนั้น</p>
            <p className="text-xs text-slate-500">Current voice: {voice}</p>
          </div>
        </ResourceCard>
      </div>

      <section className="mt-5 grid gap-3">
        <h2 className="text-lg font-semibold text-white">Recent TTS jobs</h2>
        {latestJobs.length ? latestJobs.map((job) => (
          <ResourceCard key={job.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-medium text-white">{job.text}</p>
                <p className="mt-1 text-sm text-slate-400">{job.widget?.name ?? "No widget"} · {job.voice} · {new Date(job.createdAt).toLocaleString()}</p>
                {job.errorMessage ? <p className="mt-1 text-sm text-rose-300">{job.errorMessage}</p> : null}
              </div>
              <Badge tone={statusTone[job.status]}>{job.status}</Badge>
            </div>
          </ResourceCard>
        )) : <EmptyState title="ยังไม่มี TTS job" description="ส่งข้อความทดสอบเพื่อดูสถานะ job ล่าสุดที่นี่" />}
      </section>
    </DashboardShell>
  );
}

function RangeField({
  label,
  max,
  min,
  onChange,
  step,
  value
}: {
  label: string;
  max: string;
  min: string;
  onChange: (value: number) => void;
  step: string;
  value: number;
}) {
  return (
    <label className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
      <span className="flex justify-between gap-3">
        {label}
        <span className="text-xs text-slate-500">{value.toFixed(1)}</span>
      </span>
      <Input className="mt-2 h-2 px-0 accent-indigo-500" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
