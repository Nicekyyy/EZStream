"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { API_URL, api } from "../../../lib/api";
import { copyText } from "../../../lib/clipboard";

type Widget = {
  id: string;
  name: string;
  type: string;
  overlayId: string;
  isEnabled: boolean;
  visibility: boolean;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  overlay?: { id: string; name: string };
};

export default function WidgetsPage() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setWidgets(await api<Widget[]>("/widgets"));
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Widget ไม่สำเร็จ"));
  }, []);

  const filteredWidgets = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return widgets;
    return widgets.filter((widget) =>
      [widget.name, widget.type, widget.overlay?.name ?? ""].some((value) => value.toLowerCase().includes(keyword)),
    );
  }, [query, widgets]);

  async function updateWidget(widget: Widget, data: Partial<Pick<Widget, "isEnabled" | "visibility">>) {
    setBusyId(widget.id);
    setError("");
    setMessage("");
    try {
      await api<Widget>(`/widgets/${widget.id}`, { method: "PATCH", body: JSON.stringify(data) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปเดต Widget ไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  }

  async function deleteWidget(widget: Widget) {
    if (!window.confirm(`ลบ Widget "${widget.name}"?`)) return;

    setBusyId(widget.id);
    setError("");
    setMessage("");
    try {
      await api(`/widgets/${widget.id}`, { method: "DELETE" });
      setMessage("ลบ Widget แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ Widget ไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  }

  async function copyWidgetUrl(widget: Widget) {
    const url = `${API_URL.replace("4000", "3000")}/widget/${widget.id}`;
    const copied = await copyText(url);
    if (copied) {
      setError("");
      setMessage("คัดลอก Widget URL แล้ว");
    } else {
      setMessage("");
      setError("คัดลอก Widget URL ไม่สำเร็จ");
    }
  }

  return (
    <DashboardShell title="Widgets">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          className="min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ค้นหา Widget"
          value={query}
        />
        <Link className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950" href="/dashboard/widgets/new">
          สร้าง Widget
        </Link>
      </div>

      {message ? <p className="mb-3 text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="mb-3 text-sm text-rose-400">{error}</p> : null}

      <div className="grid gap-3">
        {filteredWidgets.map((widget) => (
          <ResourceCard key={widget.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="font-medium underline" href={`/dashboard/widgets/${widget.id}`}>
                    {widget.name}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      widget.isEnabled ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {widget.isEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      widget.visibility ? "bg-sky-950 text-sky-300" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {widget.visibility ? "แสดงบน Overlay" : "ซ่อนบน Overlay"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {widget.type} · {widget.overlay?.name ?? widget.overlayId}
                </p>
                <p className="text-sm text-slate-500">
                  X {widget.positionX}, Y {widget.positionY}, {widget.width} x {widget.height}, Layer {widget.zIndex}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-md border border-slate-800 px-3 py-2 text-sm disabled:opacity-50"
                  disabled={busyId === widget.id}
                  onClick={() => void updateWidget(widget, { isEnabled: !widget.isEnabled })}
                  type="button"
                >
                  {widget.isEnabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </button>
                <button
                  className="rounded-md border border-slate-800 px-3 py-2 text-sm disabled:opacity-50"
                  disabled={busyId === widget.id}
                  onClick={() => void updateWidget(widget, { visibility: !widget.visibility })}
                  type="button"
                >
                  {widget.visibility ? "ซ่อน" : "แสดง"}
                </button>
                <Link className="rounded-md border border-slate-800 px-3 py-2 text-sm" href={`/dashboard/widgets/${widget.id}`}>
                  จัดการ
                </Link>
                <button
                  className="rounded-md border border-slate-800 px-3 py-2 text-sm disabled:opacity-50"
                  disabled={busyId === widget.id}
                  onClick={() => void copyWidgetUrl(widget)}
                  type="button"
                >
                  คัดลอก URL
                </button>
                <button
                  className="rounded-md border border-rose-800 px-3 py-2 text-sm text-rose-400 hover:bg-rose-950 disabled:opacity-50"
                  disabled={busyId === widget.id}
                  onClick={() => void deleteWidget(widget)}
                  type="button"
                >
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
