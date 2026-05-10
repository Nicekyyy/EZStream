"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { ResourceCard } from "../../../../components/resource-card";
import { API_URL, api } from "../../../../lib/api";
import { copyText } from "../../../../lib/clipboard";

type Overlay = { id: string; name: string };

type Widget = {
  id: string;
  overlayId: string;
  name: string;
  type: string;
  isEnabled: boolean;
  visibility: boolean;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  config?: unknown;
  state?: { state: unknown };
  overlay?: Overlay;
};

function configObject(widget: Widget | undefined) {
  return widget?.config && typeof widget.config === "object" && !Array.isArray(widget.config)
    ? (widget.config as Record<string, unknown>)
    : {};
}

export default function WidgetDetailPage() {
  const { widgetId } = useParams<{ widgetId: string }>();
  const router = useRouter();
  const [widget, setWidget] = useState<Widget>();
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftOverlayId, setDraftOverlayId] = useState("");
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(160);
  const [zIndex, setZIndex] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const widgetConfig = configObject(widget);
  const showPlatformLogo = widgetConfig.showPlatformLogo !== false;
  const widgetUrl = widget ? `${API_URL.replace("4000", "3000")}/widget/${widget.id}` : "";

  function syncDraft(nextWidget: Widget) {
    setWidget(nextWidget);
    setDraftName(nextWidget.name);
    setDraftOverlayId(nextWidget.overlayId);
    setPositionX(nextWidget.positionX);
    setPositionY(nextWidget.positionY);
    setWidth(nextWidget.width);
    setHeight(nextWidget.height);
    setZIndex(nextWidget.zIndex);
  }

  async function load() {
    try {
      setError("");
      const [nextWidget, nextOverlays] = await Promise.all([api<Widget>(`/widgets/${widgetId}`), api<Overlay[]>("/overlays")]);
      syncDraft(nextWidget);
      setOverlays(nextOverlays);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลด Widget ไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
  }, [widgetId]);

  async function updateWidget(data: Partial<Widget> & { config?: Record<string, unknown> }, successMessage?: string) {
    try {
      setBusy(true);
      setError("");
      setMessage("");
      const nextWidget = await api<Widget>(`/widgets/${widgetId}`, { method: "PATCH", body: JSON.stringify(data) });
      syncDraft(nextWidget);
      if (successMessage) setMessage(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปเดต Widget ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) {
      setError("กรุณาใส่ชื่อ Widget");
      return;
    }
    if (!draftOverlayId) {
      setError("กรุณาเลือก Overlay");
      return;
    }

    await updateWidget(
      {
        name,
        overlayId: draftOverlayId,
        positionX,
        positionY,
        width,
        height,
        zIndex,
      },
      "บันทึก Widget แล้ว",
    );
  }

  async function updateConfig(config: Record<string, unknown>) {
    await updateWidget({ config: { ...widgetConfig, ...config } }, "บันทึกการตั้งค่า Widget แล้ว");
  }

  async function testTrigger() {
    try {
      setBusy(true);
      setError("");
      setMessage("");
      await api(`/widgets/${widgetId}/test-trigger`, { method: "POST" });
      setMessage("ส่ง Test Trigger แล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่ง Test Trigger ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function deleteWidget() {
    if (!widget) return;
    if (!window.confirm(`ลบ Widget "${widget.name}"?`)) return;

    try {
      setBusy(true);
      setError("");
      await api(`/widgets/${widgetId}`, { method: "DELETE" });
      router.push("/dashboard/widgets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ Widget ไม่สำเร็จ");
      setBusy(false);
    }
  }

  async function copyWidgetUrl() {
    const copied = await copyText(widgetUrl);
    if (copied) {
      setError("");
      setMessage("คัดลอก Widget URL แล้ว");
    } else {
      setMessage("");
      setError("คัดลอก Widget URL ไม่สำเร็จ");
    }
  }

  return (
    <DashboardShell title="จัดการ Widget">
      <div className="mb-4">
        <Link className="text-sm text-slate-400 hover:text-white" href="/dashboard/widgets">
          กลับไปหน้า Widgets
        </Link>
      </div>

      {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {message ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <ResourceCard>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">{widget?.name ?? "กำลังโหลด"}</p>
            <p className="text-sm text-slate-400">
              {widget ? `${widget.type} · ${widget.overlay?.name ?? widget.overlayId}` : "กำลังโหลดข้อมูล Widget"}
            </p>
          </div>
          {widget ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-2 py-1 ${widget.isEnabled ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                {widget.isEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}
              </span>
              <span className={`rounded-full px-2 py-1 ${widget.visibility ? "bg-sky-950 text-sky-300" : "bg-slate-800 text-slate-400"}`}>
                {widget.visibility ? "แสดงบน Overlay" : "ซ่อนบน Overlay"}
              </span>
            </div>
          ) : null}
        </div>

        <form className="grid gap-4 lg:grid-cols-[1fr_1fr]" onSubmit={(event) => void save(event)}>
          <label className="block">
            <span className="text-sm font-medium text-slate-200">ชื่อ Widget</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              disabled={busy || !widget}
              onChange={(event) => setDraftName(event.target.value)}
              value={draftName}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-200">Overlay</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              disabled={busy || !widget}
              onChange={(event) => setDraftOverlayId(event.target.value)}
              value={draftOverlayId}
            >
              {overlays.map((overlay) => (
                <option key={overlay.id} value={overlay.id}>
                  {overlay.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 xl:grid-cols-5">
            <NumberField disabled={busy || !widget} label="X" onChange={setPositionX} value={positionX} />
            <NumberField disabled={busy || !widget} label="Y" onChange={setPositionY} value={positionY} />
            <NumberField disabled={busy || !widget} label="กว้าง" min={1} onChange={setWidth} value={width} />
            <NumberField disabled={busy || !widget} label="สูง" min={1} onChange={setHeight} value={height} />
            <NumberField disabled={busy || !widget} label="Layer" onChange={setZIndex} value={zIndex} />
          </div>

          <div className="flex flex-wrap gap-2 lg:col-span-2">
            <button className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50" disabled={busy || !widget} type="submit">
              บันทึก
            </button>
            <button
              className="rounded-md border border-slate-800 px-3 py-2 text-sm disabled:opacity-50"
              disabled={busy || !widget}
              onClick={() => widget && void updateWidget({ isEnabled: !widget.isEnabled }, widget.isEnabled ? "ปิดใช้งาน Widget แล้ว" : "เปิดใช้งาน Widget แล้ว")}
              type="button"
            >
              {widget?.isEnabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}
            </button>
            <button
              className="rounded-md border border-slate-800 px-3 py-2 text-sm disabled:opacity-50"
              disabled={busy || !widget}
              onClick={() => widget && void updateWidget({ visibility: !widget.visibility }, widget.visibility ? "ซ่อน Widget แล้ว" : "แสดง Widget แล้ว")}
              type="button"
            >
              {widget?.visibility ? "ซ่อนบน Overlay" : "แสดงบน Overlay"}
            </button>
            <button className="rounded-md border border-slate-800 px-3 py-2 text-sm disabled:opacity-50" disabled={busy || !widget} onClick={() => void testTrigger()} type="button">
              Test Trigger
            </button>
          </div>
        </form>
      </ResourceCard>

      <div className="mt-4">
        <ResourceCard>
          <p className="font-medium">Widget URL สำหรับ OBS</p>
          <p className="mt-1 break-all text-sm text-slate-400">{widgetUrl || "กำลังโหลด URL"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
              disabled={busy || !widgetUrl}
              onClick={() => void copyWidgetUrl()}
              type="button"
            >
              คัดลอก Widget URL
            </button>
            {widgetUrl ? (
              <a className="rounded-md border border-slate-800 px-3 py-2 text-sm" href={`${widgetUrl}?debug=1`} rel="noreferrer" target="_blank">
                Preview Widget
              </a>
            ) : null}
          </div>
        </ResourceCard>
      </div>

      {widgetUrl && widget ? (
        <div className="mt-4">
          <ResourceCard>
            <p className="font-medium mb-3">Live Preview</p>
            <div 
              className="relative overflow-auto rounded-md border border-slate-800 bg-slate-950"
              style={{
                backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><rect width='10' height='10' fill='%231e293b'/><rect x='10' y='10' width='10' height='10' fill='%231e293b'/><rect x='10' width='10' height='10' fill='%230f172a'/><rect y='10' width='10' height='10' fill='%230f172a'/></svg>")`,
                maxHeight: '500px',
              }}
            >
              <iframe
                src={`${widgetUrl}`}
                style={{ width: width || 400, height: height || 160, border: 'none', display: 'block' }}
                title="Widget Preview"
              />
            </div>
          </ResourceCard>
        </div>
      ) : null}

      {widget?.type === "CHAT_WIDGET" ? (
        <div className="mt-4">
          <ResourceCard>
            <p className="mb-3 font-medium">Chat Widget</p>
            <label className="flex max-w-xl items-center justify-between gap-3 text-sm text-slate-300">
              <span>แสดงโลโก้แหล่งที่มาของแชท</span>
              <input
                checked={showPlatformLogo}
                className="h-4 w-4"
                disabled={busy}
                onChange={(event) => void updateConfig({ showPlatformLogo: event.target.checked })}
                type="checkbox"
              />
            </label>
          </ResourceCard>
        </div>
      ) : null}

      <div className="mt-4">
        <ResourceCard>
          <p className="font-medium">การจัดการ</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-md border border-rose-800 px-3 py-2 text-sm text-rose-400 hover:bg-rose-950 disabled:opacity-50"
              disabled={busy || !widget}
              onClick={() => void deleteWidget()}
              type="button"
            >
              ลบ Widget
            </button>
          </div>
        </ResourceCard>
      </div>
    </DashboardShell>
  );
}

function NumberField({
  disabled,
  label,
  min,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  min?: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
        disabled={disabled}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}
