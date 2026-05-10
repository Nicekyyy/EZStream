"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { defaultGoogleTtsVoiceName, googleTtsVoices, resolveGoogleTtsVoiceName } from "@ezstream/shared";
import type { GoogleTtsVoiceName } from "@ezstream/shared";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { API_URL, api } from "../../../lib/api";

type Overlay = { id: string; name: string; token: string };
type TtsWidget = { id: string; name: string; type: string; overlayId: string; isEnabled: boolean; config?: unknown };
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
    setWidgetId(nextWidgetId);
    setVoice(resolveGoogleTtsVoiceName(configObject(nextWidget).voice, defaultGoogleTtsVoiceName));
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load TTS data"));
  }, []);

  const selectedWidget = widgets.find((widget) => widget.id === widgetId);
  const selectedWidgetConfig = configObject(selectedWidget);
  const selectedOverlay = overlays.find((overlay) => overlay.id === selectedWidget?.overlayId);
  const overlayUrl = selectedOverlay ? `${API_URL.replace("4000", "3000")}/overlay/${selectedOverlay.token}` : "";
  const previewUrl = selectedOverlay ? `${API_URL.replace("4000", "3000")}/overlay/preview/${selectedOverlay.token}?debug=1` : "";
  const canSubmit = Boolean(text.trim() && widgetId && !submitting);
  const latestJobs = useMemo(() => jobs.slice(0, 20), [jobs]);

  function selectWidget(nextWidgetId: string) {
    const nextWidget = widgets.find((widget) => widget.id === nextWidgetId);
    setWidgetId(nextWidgetId);
    setVoice(resolveGoogleTtsVoiceName(configObject(nextWidget).voice, defaultGoogleTtsVoiceName));
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
        body: JSON.stringify({ config: { ...selectedWidgetConfig, voice, speed, pitch, volume } })
      });
      setMessage("Saved this voice as the widget default.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the widget voice");
    } finally {
      setSavingVoice(false);
    }
  }

  return (
    <DashboardShell title="TTS">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <ResourceCard>
          <form onSubmit={submit} className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tts-widget">TTS Widget</label>
              <select id="tts-widget" className="w-full rounded-md border px-3 py-2" value={widgetId} onChange={(event) => selectWidget(event.target.value)}>
                {widgets.length ? widgets.map((widget) => <option key={widget.id} value={widget.id}>{widget.name}</option>) : <option value="">No TTS widget</option>}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tts-voice">Voice</label>
              <div className="flex flex-wrap gap-2">
                <select id="tts-voice" className="min-w-0 flex-1 rounded-md border px-3 py-2" value={voice} onChange={(event) => setVoice(resolveGoogleTtsVoiceName(event.target.value, defaultGoogleTtsVoiceName))}>
                  {googleTtsVoices.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}
                </select>
                <button className="rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100" type="button" disabled={!selectedWidget || savingVoice} onClick={() => void saveVoiceDefault()}>
                  {savingVoice ? "Saving..." : "Save default"}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tts-text">Test text</label>
              <textarea
                id="tts-text"
                className="min-h-28 w-full rounded-md border px-3 py-2"
                maxLength={300}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">{text.length}/300 characters</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm text-slate-700">
                Speed
                <input className="mt-1 w-full" type="range" min="0.5" max="2" step="0.1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
                <span className="text-xs text-slate-500">{speed.toFixed(1)}</span>
              </label>
              <label className="text-sm text-slate-700">
                Pitch
                <input className="mt-1 w-full" type="range" min="0" max="2" step="0.1" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} />
                <span className="text-xs text-slate-500">{pitch.toFixed(1)}</span>
              </label>
              <label className="text-sm text-slate-700">
                Volume
                <input className="mt-1 w-full" type="range" min="0" max="1" step="0.1" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
                <span className="text-xs text-slate-500">{volume.toFixed(1)}</span>
              </label>
            </div>

            <button className="w-fit rounded-md bg-slate-950 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-slate-400" disabled={!canSubmit}>
              {submitting ? "Sending..." : "Test TTS"}
            </button>
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          </form>
        </ResourceCard>

        <ResourceCard>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Overlay URL for OBS</p>
              {overlayUrl ? <p className="break-all text-sm text-slate-600">{overlayUrl}</p> : <p className="text-sm text-slate-500">Select a TTS widget first</p>}
            </div>
            {previewUrl ? <a className="inline-flex rounded-md border px-3 py-2 text-sm" href={previewUrl} target="_blank" rel="noreferrer">Open preview with debug</a> : null}
            <p className="text-sm text-slate-600">Google Cloud Text-to-Speech generates an MP3, then the overlay machine plays that audio.</p>
            <p className="text-xs text-slate-500">Current voice: {voice}</p>
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
                <p className="text-sm text-slate-500">{job.widget?.name ?? "No widget"} · {job.voice} · {new Date(job.createdAt).toLocaleString()}</p>
                {job.errorMessage ? <p className="mt-1 text-sm text-rose-700">{job.errorMessage}</p> : null}
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass[job.status]}`}>{job.status}</span>
            </div>
          </ResourceCard>
        )) : <ResourceCard><p className="text-sm text-slate-500">No TTS jobs yet</p></ResourceCard>}
      </section>
    </DashboardShell>
  );
}
