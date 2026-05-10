"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { api } from "../../../../lib/api";

const widgetTypes = ["ALERT_WIDGET", "TTS_WIDGET", "GOAL_WIDGET", "EVENT_LIST_WIDGET", "CHAT_WIDGET", "IMAGE_WIDGET", "SOUND_WIDGET", "TEXT_WIDGET"];

export default function NewWidgetPage() {
  const router = useRouter();
  const [overlays, setOverlays] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState("New Widget");
  const [type, setType] = useState("ALERT_WIDGET");
  const [overlayId, setOverlayId] = useState("");

  useEffect(() => {
    api<{ id: string; name: string }[]>("/overlays").then((items) => {
      setOverlays(items);
      setOverlayId(items[0]?.id ?? "");
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const widget = await api<{ id: string }>("/widgets", { method: "POST", body: JSON.stringify({ overlayId, name, type, width: 420, height: 160 }) });
    router.push(`/dashboard/widgets/${widget.id}`);
  }

  return (
    <DashboardShell title="สร้าง Widget">
      <form onSubmit={submit} className="max-w-xl space-y-3 rounded-md border bg-white p-4">
        <input className="w-full rounded-md border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="w-full rounded-md border px-3 py-2" value={overlayId} onChange={(e) => setOverlayId(e.target.value)}>{overlays.map((overlay) => <option key={overlay.id} value={overlay.id}>{overlay.name}</option>)}</select>
        <select className="w-full rounded-md border px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>{widgetTypes.map((item) => <option key={item}>{item}</option>)}</select>
        <button className="rounded-md bg-slate-950 px-4 py-2 text-white" disabled={!overlayId}>บันทึก</button>
      </form>
    </DashboardShell>
  );
}
