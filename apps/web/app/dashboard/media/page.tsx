"use client";

import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { api } from "../../../lib/api";

type MediaAsset = { id: string; originalName: string; type: string };

export default function MediaPage() {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  async function load() { setItems(await api<MediaAsset[]>("/media")); }
  useEffect(() => void load(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    const result = await api<{ message: string }>("/media/upload", { method: "POST", body: form });
    setMessage(result.message);
    await load();
  }
  return (
    <DashboardShell title="Media">
      <form onSubmit={submit} className="mb-4 flex flex-wrap gap-2">
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="rounded-md bg-slate-950 px-4 py-2 text-white" disabled={!file}>Upload</button>
      </form>
      {message ? <p className="mb-3 text-sm text-slate-600">{message}</p> : null}
      <div className="grid gap-3">{items.map((item) => <ResourceCard key={item.id}><p>{item.originalName}</p><p className="text-sm text-slate-500">{item.type}</p></ResourceCard>)}</div>
    </DashboardShell>
  );
}
