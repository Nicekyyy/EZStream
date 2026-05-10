"use client";

import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { api } from "../../../lib/api";

type TtsJob = { id: string; text: string; status: string; createdAt: string };

export default function TtsPage() {
  const [jobs, setJobs] = useState<TtsJob[]>([]);
  const [text, setText] = useState("Hello from dashboard");
  async function load() { setJobs(await api<TtsJob[]>("/tts/jobs")); }
  useEffect(() => void load(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await api("/tts/test", { method: "POST", body: JSON.stringify({ text }) });
    await load();
  }
  return (
    <DashboardShell title="TTS">
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input className="flex-1 rounded-md border px-3 py-2" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="rounded-md bg-slate-950 px-4 py-2 text-white">ทดสอบ TTS</button>
      </form>
      <div className="grid gap-3">{jobs.map((job) => <ResourceCard key={job.id}><p>{job.text}</p><p className="text-sm text-slate-500">{job.status}</p></ResourceCard>)}</div>
    </DashboardShell>
  );
}
