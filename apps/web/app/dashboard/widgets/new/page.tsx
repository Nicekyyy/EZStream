"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { api } from "../../../../lib/api";

const widgetTypes = [
  "CHAT_WIDGET",
  "TTS_WIDGET",
  "ALERT_WIDGET",
  "GOAL_WIDGET",
  "EVENT_LIST_WIDGET",
  "IMAGE_WIDGET",
  "SOUND_WIDGET",
  "TEXT_WIDGET",
];

export default function NewWidgetPage() {
  const router = useRouter();
  const [overlays, setOverlays] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState("New Widget");
  const [type, setType] = useState("CHAT_WIDGET");
  const [overlayId, setOverlayId] = useState("");
  const [width, setWidth] = useState(420);
  const [height, setHeight] = useState(160);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ id: string; name: string }[]>("/overlays")
      .then((items) => {
        setOverlays(items);
        setOverlayId(items[0]?.id ?? "");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Overlay ไม่สำเร็จ"));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("กรุณาใส่ชื่อ Widget");
      return;
    }
    if (!overlayId) {
      setError("กรุณาสร้างหรือเลือก Overlay ก่อน");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const widget = await api<{ id: string }>("/widgets", {
        method: "POST",
        body: JSON.stringify({ overlayId, name: name.trim(), type, width, height }),
      });
      router.push(`/dashboard/widgets/${widget.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง Widget ไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <DashboardShell title="สร้าง Widget">
      {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <form className="max-w-2xl space-y-4 rounded-md border border-slate-800 bg-slate-900 p-4" onSubmit={submit}>
        <label className="block">
          <span className="text-sm font-medium text-slate-200">ชื่อ Widget</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-200">Overlay</span>
          <select
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
            onChange={(event) => setOverlayId(event.target.value)}
            value={overlayId}
          >
            {overlays.map((overlay) => (
              <option key={overlay.id} value={overlay.id}>
                {overlay.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-200">ประเภท</span>
          <select
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
            onChange={(event) => setType(event.target.value)}
            value={type}
          >
            {widgetTypes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-200">กว้าง</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              min={1}
              onChange={(event) => setWidth(Number(event.target.value))}
              type="number"
              value={width}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-200">สูง</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              min={1}
              onChange={(event) => setHeight(Number(event.target.value))}
              type="number"
              value={height}
            />
          </label>
        </div>

        <button className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50" disabled={busy || !overlayId}>
          บันทึก
        </button>
      </form>
    </DashboardShell>
  );
}
