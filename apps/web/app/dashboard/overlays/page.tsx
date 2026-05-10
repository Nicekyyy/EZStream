"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { API_URL, api } from "../../../lib/api";

type Overlay = { id: string; name: string; token: string; width: number; height: number };

export default function OverlaysPage() {
  const [items, setItems] = useState<Overlay[]>([]);
  const [name, setName] = useState("New Overlay");
  const [message, setMessage] = useState("");

  async function load() {
    setItems(await api<Overlay[]>("/overlays"));
  }

  useEffect(() => void load(), []);

  async function create(event: FormEvent) {
    event.preventDefault();
    await api("/overlays", { method: "POST", body: JSON.stringify({ name, width: 1920, height: 1080 }) });
    setMessage("สร้าง overlay แล้ว");
    await load();
  }

  return (
    <DashboardShell title="Overlays">
      <form onSubmit={create} className="mb-4 flex gap-2">
        <input className="rounded-md border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="rounded-md bg-slate-950 px-4 py-2 text-white">สร้าง Overlay</button>
      </form>
      {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}
      <div className="grid gap-3">
        {items.map((overlay) => (
          <ResourceCard key={overlay.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{overlay.name}</p>
                <p className="text-sm text-slate-500">{overlay.width}x{overlay.height}</p>
                <p className="break-all text-sm text-slate-600">{API_URL.replace("4000", "3000")}/overlay/{overlay.token}</p>
              </div>
              <Link className="rounded-md border px-3 py-2 text-sm" href={`/dashboard/overlays/${overlay.id}`}>จัดการ</Link>
            </div>
          </ResourceCard>
        ))}
      </div>
    </DashboardShell>
  );
}
