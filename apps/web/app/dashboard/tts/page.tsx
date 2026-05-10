"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { defaultGoogleTtsVoiceName, googleTtsVoices, resolveGoogleTtsVoiceName } from "@ezstream/shared";
import type { GoogleTtsVoiceName } from "@ezstream/shared";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { API_URL, api } from "../../../lib/api";
import { copyText } from "../../../lib/clipboard";

type Overlay = { id: string; name: string; token: string };
type TtsWidget = { id: string; name: string; type: string; overlayId: string; isEnabled: boolean; visibility?: boolean; config?: unknown };
type TtsJob = {
  id: string;
  text: string;
  voice: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string;
  errorMessage?: string | null;
  widget?: { id: string; name: string; overlay?: { id: string; name: string; token: string } } | null;
};

const statusClass: Record<TtsJob["status"], string> = {
  QUEUED: "bg-amber-50 text-amber-700",
  PROCESSING: "bg-sky-50 text-sky-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-rose-50 text-rose-700"
};

function configObject(widget: TtsWidget | undefined) {
  return widget?.config && typeof widget.config === "object" && !Array.isArray(widget.config) ? (widget.config as Record<string, unknown>) : {};
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
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load TTS data"));
  }, []);

  const selectedWidget = widgets.find((widget) => widget.id === widgetId);
  const selectedWidgetConfig = configObject(selectedWidget);
  const selectedOverlay = overlays.find((overlay) => overlay.id === selectedWidget?.overlayId);
  const overlayUrl = selectedOverlay && typeof window !== "undefined" ? `${window.location.origin}/overlay/${selectedOverlay.token}` : "";
  const previewUrl = selectedOverlay && typeof window !== "undefined" ? `${window.location.origin}/overlay/preview/${selectedOverlay.token}?debug=1` : "";
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
      setMessage("TTS job queued. Keep the overlay open to hear the audio.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "TTS test failed");
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
      setMessage("Saved TTS settings.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the widget voice");
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
              <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="tts-widget">TTS Widget</label>
              <select id="tts-widget" className="w-full rounded-md border border-slate-800 px-3 py-2" value={widgetId} onChange={(event) => selectWidget(event.target.value)}>
                {widgets.length ? widgets.map((widget) => <option key={widget.id} value={widget.id}>{widget.name}</option>) : <option value="">No TTS widget</option>}
              </select>
              {selectedWidget ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className={`rounded-full px-2 py-1 ${selectedWidget.isEnabled ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                    {selectedWidget.isEnabled ? "Widget เปิดใช้งานอยู่" : "Widget ปิดใช้งานอยู่"}
                  </span>
                  <span className={`rounded-full px-2 py-1 ${selectedWidget.visibility !== false ? "bg-sky-950 text-sky-300" : "bg-slate-800 text-slate-400"}`}>
                    {selectedWidget.visibility !== false ? "แสดงบน Overlay" : "ซ่อนบน Overlay"}
                  </span>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="tts-voice">Voice</label>
              <div className="flex flex-wrap gap-2">
                <select id="tts-voice" className="min-w-0 flex-1 rounded-md border border-slate-800 px-3 py-2" value={voice} onChange={(event) => setVoice(resolveGoogleTtsVoiceName(event.target.value, defaultGoogleTtsVoiceName))}>
                  {googleTtsVoices.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}
                </select>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              <span>อ่านชื่อคนส่งก่อนข้อความแชท</span>
              <input
                className="h-4 w-4"
                type="checkbox"
                checked={includeSenderName}
                onChange={(event) => setIncludeSenderName(event.target.checked)}
              />
            </label>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="tts-text">Test text</label>
              <textarea
                id="tts-text"
                className="min-h-28 w-full rounded-md border border-slate-800 px-3 py-2"
                maxLength={300}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">{text.length}/300 characters</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm text-slate-300">
                Speed
                <input className="mt-1 w-full" type="range" min="0.5" max="2" step="0.1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
                <span className="text-xs text-slate-400">{speed.toFixed(1)}</span>
              </label>
              <label className="text-sm text-slate-300">
                Pitch
                <input className="mt-1 w-full" type="range" min="0" max="2" step="0.1" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} />
                <span className="text-xs text-slate-400">{pitch.toFixed(1)}</span>
              </label>
              <label className="text-sm text-slate-300">
                Volume
                <input className="mt-1 w-full" type="range" min="0" max="1" step="0.1" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
                <span className="text-xs text-slate-400">{volume.toFixed(1)}</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="rounded-md bg-slate-950 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-slate-400" disabled={!canSubmit}>
                {submitting ? "Sending..." : "Test TTS"}
              </button>
              <button className="rounded-md border border-slate-800 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-800" type="button" disabled={!selectedWidget || savingVoice} onClick={() => void saveVoiceDefault()}>
                {savingVoice ? "Saving..." : "Save default"}
              </button>
            </div>
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          </form>
        </ResourceCard>

        <ResourceCard>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-300">Overlay URL for OBS</p>
              {overlayUrl ? <p className="break-all text-sm text-slate-400">{overlayUrl}</p> : <p className="text-sm text-slate-400">Select a TTS widget first</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {overlayUrl ? (
                <button className="rounded-md border border-slate-800 px-3 py-2 text-sm" onClick={() => void copyUrl(overlayUrl, " Overlay URL")} type="button">
                  คัดลอก Overlay URL
                </button>
              ) : null}
              {previewUrl ? (
                <>
                  <button className="rounded-md border border-slate-800 px-3 py-2 text-sm" onClick={() => void copyUrl(previewUrl, " Preview URL")} type="button">
                    คัดลอก Preview URL
                  </button>
                  <a className="inline-flex rounded-md border border-slate-800 px-3 py-2 text-sm" href={previewUrl} target="_blank" rel="noreferrer">Open preview with debug</a>
                </>
              ) : null}
            </div>
            <p className="text-sm text-slate-400">Google Cloud Text-to-Speech generates an MP3, then the overlay machine plays that audio.</p>
            <p className="text-xs text-slate-400">Current voice: {voice}</p>
          </div>
        </ResourceCard>
      </div>

      <section className="mt-4 grid gap-3">
        <h2 className="text-lg font-semibold">Recent TTS jobs</h2>
        {latestJobs.length ? latestJobs.map((job) => (
          <ResourceCard key={job.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{job.text}</p>
                <p className="text-sm text-slate-400">{job.widget?.name ?? "No widget"} · {job.voice} · {new Date(job.createdAt).toLocaleString()}</p>
                {job.errorMessage ? <p className="mt-1 text-sm text-rose-700">{job.errorMessage}</p> : null}
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass[job.status]}`}>{job.status}</span>
            </div>
          </ResourceCard>
        )) : <ResourceCard><p className="text-sm text-slate-400">No TTS jobs yet</p></ResourceCard>}
      </section>
    </DashboardShell>
  );
}
