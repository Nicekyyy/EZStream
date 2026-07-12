"use client";

import { Button } from "@ezstream/ui";
import { defaultGoogleTtsVoiceName, googleTtsVoices, resolveGoogleTtsVoiceName } from "@ezstream/shared";
import type { GoogleTtsVoiceName } from "@ezstream/shared";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import Link from "next/link";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { Badge, EmptyState, Field, Input, LoadingCards, Notice, PageActions, Select, Textarea } from "../../../components/ui-kit";
import { API_URL, api, resolveAssetUrl } from "../../../lib/api";

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
  const [ignoreCommands, setIgnoreCommands] = useState(true);
  const [maxMessageLength, setMaxMessageLength] = useState(300);
  const [bannedWords, setBannedWords] = useState("");
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
      const audio = new Audio(resolveAssetUrl(next.audioUrl));
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
    setSpeed(typeof nextConfig.speed === "number" ? nextConfig.speed : 1);
    setPitch(typeof nextConfig.pitch === "number" ? nextConfig.pitch : 1);
    setVolume(typeof nextConfig.volume === "number" ? nextConfig.volume : 1);
    setIgnoreCommands(nextConfig.ignoreCommands !== false);
    setMaxMessageLength(typeof nextConfig.maxMessageLength === "number" ? nextConfig.maxMessageLength : 300);
    setBannedWords(typeof nextConfig.bannedWords === "string" ? nextConfig.bannedWords : "");
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
  const canSubmit = Boolean(text.trim() && widgetId && !submitting);
  const latestJobs = useMemo(() => jobs.slice(0, 20), [jobs]);

  function selectWidget(nextWidgetId: string) {
    const nextWidget = widgets.find((widget) => widget.id === nextWidgetId);
    const nextConfig = configObject(nextWidget);
    setWidgetId(nextWidgetId);
    setVoice(resolveGoogleTtsVoiceName(nextConfig.voice, defaultGoogleTtsVoiceName));
    setIncludeSenderName(nextConfig.includeSenderName !== false);
    setSpeed(typeof nextConfig.speed === "number" ? nextConfig.speed : 1);
    setPitch(typeof nextConfig.pitch === "number" ? nextConfig.pitch : 1);
    setVolume(typeof nextConfig.volume === "number" ? nextConfig.volume : 1);
    setIgnoreCommands(nextConfig.ignoreCommands !== false);
    setMaxMessageLength(typeof nextConfig.maxMessageLength === "number" ? nextConfig.maxMessageLength : 300);
    setBannedWords(typeof nextConfig.bannedWords === "string" ? nextConfig.bannedWords : "");
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
        body: JSON.stringify({ config: { ...selectedWidgetConfig, voice, speed, pitch, volume, includeSenderName, ignoreCommands, maxMessageLength, bannedWords } })
      });
      setMessage("บันทึกค่า TTS แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกเสียงเริ่มต้นไม่สำเร็จ");
    } finally {
      setSavingVoice(false);
    }
  }

  return (
    <DashboardShell title="TTS">
      <PageActions>
        <p className="max-w-2xl text-sm leading-6 text-slate-400">ทดสอบเสียงพูด เลือกเสียงที่ชอบ และบันทึกเป็นค่าเริ่มต้นสำหรับ TTS widget แต่ละตัวที่ใช้งานอยู่</p>
      </PageActions>

      <div className="grid gap-4">
        {loading ? (
          <LoadingCards count={1} />
        ) : widgets.length === 0 ? (
          <EmptyState 
            title="ยังไม่มี TTS Widget" 
            description="คุณต้องสร้าง TTS Widget อย่างน้อย 1 ตัวในหน้า Widgets เพื่อเริ่มต้นใช้งานและตั้งค่าเสียง"
            action={
              <Button asChild className="bg-primary text-black border-2 border-transparent hover:border-white shadow-none hover:shadow-brutal-sm transition-all active:translate-y-1 font-semibold">
                <Link href="/dashboard/widgets/new">สร้าง TTS Widget</Link>
              </Button>
            }
          />
        ) : (
          <ResourceCard>
            <form onSubmit={submit} className="grid gap-6">

            <Field label="TTS Widget">
              <Select id="tts-widget" value={widgetId} onChange={(event) => selectWidget(event.target.value)} disabled={loading}>
                {widgets.length ? widgets.map((widget) => <option key={widget.id} value={widget.id}>{widget.name}</option>) : <option value="">ไม่มี TTS widget</option>}
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

            <ToggleField 
              label="อ่านชื่อผู้ส่งก่อนข้อความแชท" 
              isChecked={includeSenderName} 
              onChange={setIncludeSenderName} 
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <RangeField label="Speed" min="0.5" max="2" step="0.1" value={speed} onChange={setSpeed} />
              <RangeField label="Pitch" min="0" max="2" step="0.1" value={pitch} onChange={setPitch} />
              <RangeField label="Volume" min="0" max="1" step="0.1" value={volume} onChange={setVolume} />
            </div>

            <div className="border-t-2 border-border-base pt-6 mt-2 grid gap-6">
              <h3 className="text-base font-semibold text-white">การกรองข้อความ (Filtering)</h3>
              
              <ToggleField 
                label="ละเว้นข้อความที่เป็นคำสั่ง (ขึ้นต้นด้วย ! หรือ /)" 
                isChecked={ignoreCommands} 
                onChange={setIgnoreCommands} 
              />
              
              <Field label="ความยาวข้อความสูงสุด" hint="หากเกินจะตัดส่วนที่เกินทิ้ง">
                <Input type="number" min={1} max={1000} value={maxMessageLength} onChange={(event) => setMaxMessageLength(Number(event.target.value) || 300)} />
              </Field>

              <Field label="คำที่ต้องการข้าม / ซ่อนคำหยาบ" hint="คั่นด้วยเครื่องหมายจุลภาค (,) เช่น คำหยาบ1,คำหยาบ2 (TTS จะข้ามคำเหล่านี้ไม่อ่านออกเสียง)">
                <Textarea value={bannedWords} onChange={(event) => setBannedWords(event.target.value)} placeholder="คำหยาบ1,คำหยาบ2,คำที่ไม่อยากให้อ่าน..." className="min-h-20" />
              </Field>
            </div>

            <div className="border-t-2 border-border-base pt-6 mt-2 grid gap-6">
              <h3 className="text-base font-semibold text-white">ทดสอบเสียง</h3>
              <Field label="ข้อความทดสอบ" hint={`${text.length}/300 characters`}>
                <Textarea id="tts-text" className="min-h-20" maxLength={300} value={text} onChange={(event) => setText(event.target.value)} />
              </Field>
            </div>

            <div className="flex flex-wrap gap-4 mt-2 border-t-2 border-border-base pt-6">
              <Button disabled={!canSubmit} className="bg-primary text-black border-2 border-transparent hover:border-white shadow-none hover:shadow-brutal-sm transition-all active:translate-y-1 font-semibold px-6 py-2.5">
                {submitting ? "กำลังส่ง..." : "ทดสอบ TTS"}
              </Button>
              <Button type="button" disabled={!selectedWidget || savingVoice} onClick={() => void saveVoiceDefault()} className="bg-surface-dark text-white border-2 border-border-base hover:border-white shadow-none hover:shadow-brutal-sm transition-all active:translate-y-1 font-semibold px-6 py-2.5">
                {savingVoice ? "กำลังบันทึก..." : "บันทึกเป็นค่าเริ่มต้น"}
              </Button>
            </div>
            {message ? <Notice tone="success">{message}</Notice> : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
          </form>
        </ResourceCard>
        )}
      </div>

      <section className="mt-8 grid gap-4">
        <h2 className="text-lg font-bold text-white mb-2">ประวัติการพูด TTS ล่าสุด</h2>
        {latestJobs.length ? latestJobs.map((job) => (
          <ResourceCard key={job.id} className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-medium text-white text-base">{job.text}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-ink-subtle">
                  <p><span className="text-ink-faint mr-1.5">WIDGET</span> {job.widget?.name ?? "ไม่พบ widget"}</p>
                  <p><span className="text-ink-faint mr-1.5">VOICE</span> {job.voice}</p>
                  <p><span className="text-ink-faint mr-1.5">TIME</span> {new Date(job.createdAt).toLocaleString()}</p>
                </div>
                {job.errorMessage ? <p className="mt-3 text-sm font-medium text-rose-400">{job.errorMessage}</p> : null}
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
  const percent = ((value - Number(min)) / (Number(max) - Number(min))) * 100;
  
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center text-xs font-semibold text-ink-muted">
        <span>{label}</span>
        <span className="text-primary">{value.toFixed(1)}</span>
      </div>
      <div className="relative flex h-8 w-full items-center border-2 border-border-base bg-surface-dark">
        <div className="absolute inset-y-0 left-0 bg-primary border-r-2 border-black" style={{ width: `${percent}%` }} />
        <input 
          className="absolute inset-0 w-full cursor-pointer opacity-0" 
          type="range" min={min} max={max} step={step} value={value} 
          onChange={(event) => onChange(Number(event.target.value))} 
        />
      </div>
    </div>
  );
}

function ToggleField({
  label,
  isChecked,
  onChange,
}: {
  label: string;
  isChecked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-4 border-2 p-3 transition-colors duration-200 ${
      isChecked ? "border-primary bg-surface-dark" : "border-border-base bg-surface-card hover:border-border-faint"
    }`}>
      <span className="text-sm font-semibold text-white">{label}</span>
      <div className={`relative flex h-7 w-14 shrink-0 items-center border-2 transition-colors duration-200 ${
        isChecked ? "border-primary bg-primary" : "border-ink-base bg-surface-dark"
      }`}>
        <div className={`h-4 w-4 border-2 transition-transform duration-200 ${
          isChecked ? "translate-x-[32px] border-black bg-white" : "translate-x-[2px] border-transparent bg-ink-muted"
        }`} />
      </div>
      <input checked={isChecked} className="sr-only" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}
