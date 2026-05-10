"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { API_URL, api } from "../../../lib/api";

type Overlay = { id: string; name: string; token: string };
type TtsWidget = { id: string; name: string; type: string; overlayId: string; isEnabled: boolean };
type TtsJob = {
  id: string;
  text: string;
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

export default function TtsPage() {
  const [jobs, setJobs] = useState<TtsJob[]>([]);
  const [widgets, setWidgets] = useState<TtsWidget[]>([]);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [widgetId, setWidgetId] = useState("");
  const [text, setText] = useState("Hello from dashboard");
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    setWidgetId((current) => current || ttsWidgets[0]?.id || "");
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดข้อมูล TTS ไม่สำเร็จ"));
  }, []);

  const selectedWidget = widgets.find((widget) => widget.id === widgetId);
  const selectedOverlay = overlays.find((overlay) => overlay.id === selectedWidget?.overlayId);
  const overlayUrl = selectedOverlay ? `${API_URL.replace("4000", "3000")}/overlay/${selectedOverlay.token}` : "";
  const previewUrl = selectedOverlay ? `${API_URL.replace("4000", "3000")}/overlay/preview/${selectedOverlay.token}?debug=1` : "";
  const canSubmit = Boolean(text.trim() && widgetId && !submitting);
  const latestJobs = useMemo(() => jobs.slice(0, 20), [jobs]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      await api<TtsJob>("/tts/test", {
        method: "POST",
        body: JSON.stringify({ text: text.trim(), widgetId, speed, pitch, volume })
      });
      setMessage("ส่ง TTS เข้า queue แล้ว เปิด overlay ไว้เพื่อให้ได้ยินเสียง");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทดสอบ TTS ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardShell title="TTS">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <ResourceCard>
          <form onSubmit={submit} className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tts-widget">TTS Widget</label>
              <select id="tts-widget" className="w-full rounded-md border px-3 py-2" value={widgetId} onChange={(event) => setWidgetId(event.target.value)}>
                {widgets.length ? widgets.map((widget) => <option key={widget.id} value={widget.id}>{widget.name}</option>) : <option value="">ยังไม่มี TTS widget</option>}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tts-text">ข้อความทดสอบ</label>
              <textarea
                id="tts-text"
                className="min-h-28 w-full rounded-md border px-3 py-2"
                maxLength={300}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">{text.length}/300 ตัวอักษร</p>
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
              {submitting ? "กำลังส่ง..." : "ทดสอบ TTS"}
            </button>
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          </form>
        </ResourceCard>

        <ResourceCard>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Overlay ที่ต้องเปิดใน OBS</p>
              {overlayUrl ? <p className="break-all text-sm text-slate-600">{overlayUrl}</p> : <p className="text-sm text-slate-500">เลือก TTS widget ก่อน</p>}
            </div>
            {previewUrl ? <a className="inline-flex rounded-md border px-3 py-2 text-sm" href={previewUrl} target="_blank" rel="noreferrer">เปิด Preview พร้อม debug</a> : null}
            <p className="text-sm text-slate-600">ระบบจะสร้างเสียงด้วย Google Cloud Text-to-Speech แล้วเล่นจากเครื่องที่เปิด overlay ไม่ใช่จากหน้า dashboard นี้</p>
            <p className="text-xs text-slate-500">เสียงเริ่มต้น: th-TH-Neural2-C</p>
          </div>
        </ResourceCard>
      </div>

      <section className="mt-4 grid gap-3">
        <h2 className="text-lg font-semibold">งาน TTS ล่าสุด</h2>
        {latestJobs.length ? latestJobs.map((job) => (
          <ResourceCard key={job.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{job.text}</p>
                <p className="text-sm text-slate-500">{job.widget?.name ?? "ไม่ระบุ widget"} · {new Date(job.createdAt).toLocaleString()}</p>
                {job.errorMessage ? <p className="mt-1 text-sm text-rose-700">{job.errorMessage}</p> : null}
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass[job.status]}`}>{job.status}</span>
            </div>
          </ResourceCard>
        )) : <ResourceCard><p className="text-sm text-slate-500">ยังไม่มีงาน TTS</p></ResourceCard>}
      </section>
    </DashboardShell>
  );
}
