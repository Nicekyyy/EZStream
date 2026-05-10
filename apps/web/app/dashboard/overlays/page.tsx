"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { API_URL, api } from "../../../lib/api";
import { copyText } from "../../../lib/clipboard";

type Overlay = { id: string; name: string; token: string; width: number; height: number; isActive: boolean };

export default function OverlaysPage() {
  const [items, setItems] = useState<Overlay[]>([]);
  const [name, setName] = useState("New Overlay");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    setItems(await api<Overlay[]>("/overlays"));
  }

  useEffect(() => void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Overlay ไม่สำเร็จ")), []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await api("/overlays", { method: "POST", body: JSON.stringify({ name, width: 1920, height: 1080 }) });
      setMessage("สร้าง Overlay แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง Overlay ไม่สำเร็จ");
    }
  }

  async function toggleActive(overlay: Overlay) {
    setBusyId(overlay.id);
    setMessage("");
    setError("");
    try {
      await api(`/overlays/${overlay.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !overlay.isActive }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปเดต Overlay ไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  }

  async function deleteOverlay(overlay: Overlay) {
    if (!window.confirm(`ลบ Overlay "${overlay.name}"? Widget และ Chat Source ที่อยู่ใน Overlay นี้จะถูกลบไปด้วย`)) return;
    setBusyId(overlay.id);
    setMessage("");
    setError("");
    try {
      await api(`/overlays/${overlay.id}`, { method: "DELETE" });
      setMessage("ลบ Overlay แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ Overlay ไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  }

  async function copyUrl(overlay: Overlay) {
    const url = `${API_URL.replace("4000", "3000")}/overlay/${overlay.token}`;
    const copied = await copyText(url);
    if (copied) {
      setError("");
      setMessage("คัดลอก URL แล้ว");
    } else {
      setMessage("");
      setError("คัดลอก URL ไม่สำเร็จ");
    }
  }

  return (
    <DashboardShell title="Overlays">
      <form onSubmit={create} className="mb-4 flex flex-wrap gap-2">
        <input className="min-w-0 flex-1 rounded-md border border-slate-800 px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} />
        <button className="rounded-md bg-slate-950 px-4 py-2 text-white">สร้าง Overlay</button>
      </form>
      {message ? <p className="mb-3 text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="mb-3 text-sm text-rose-400">{error}</p> : null}
      <div className="grid gap-3">
        {items.map((overlay) => (
          <ResourceCard key={overlay.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{overlay.name}</p>
                  <span className={`rounded-full px-2 py-1 text-xs ${overlay.isActive ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                    {overlay.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{overlay.width}x{overlay.height}</p>
                <p className="break-all text-sm text-slate-400">{API_URL.replace("4000", "3000")}/overlay/{overlay.token}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-md border border-slate-800 px-3 py-2 text-sm" disabled={busyId === overlay.id} onClick={() => void toggleActive(overlay)} type="button">
                  {overlay.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </button>
                <button className="rounded-md border border-slate-800 px-3 py-2 text-sm" disabled={busyId === overlay.id} onClick={() => void copyUrl(overlay)} type="button">
                  คัดลอก URL
                </button>
                <Link className="rounded-md border border-slate-800 px-3 py-2 text-sm" href={`/dashboard/overlays/${overlay.id}`}>จัดการ</Link>
                <button className="rounded-md border border-rose-800 px-3 py-2 text-sm text-rose-400 hover:bg-rose-950" disabled={busyId === overlay.id} onClick={() => void deleteOverlay(overlay)} type="button">
                  ลบ
                </button>
              </div>
            </div>
          </ResourceCard>
        ))}
      </div>
    </DashboardShell>
  );
}
