"use client";

import { Button } from "@ezstream/ui";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { ResourceCard } from "../../../../components/resource-card";
import { Field, Input, Notice, Select } from "../../../../components/ui-kit";
import { api } from "../../../../lib/api";
import { useUnsavedChangesWarning } from "../../../../lib/use-unsaved-changes-warning";

const widgetTypes = [
  "CHAT_WIDGET",
  "TTS_WIDGET",
  "VIEWER_COUNT_WIDGET",
  "ALERT_WIDGET",
  "GOAL_WIDGET",
  "EVENT_LIST_WIDGET",
  "IMAGE_WIDGET",
  "SOUND_WIDGET",
  "TEXT_WIDGET"
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
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Overlay ไม่สำเร็จ"));
  }, []);

  const isDirty = name !== "New Widget" || type !== "CHAT_WIDGET" || overlayId !== "" || width !== 420 || height !== 160;
  const { UnsavedChangesModal } = useUnsavedChangesWarning(isDirty);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("กรุณาใส่ชื่อ Widget");
      return;
    }
    try {
      setBusy(true);
      setError("");
      const widget = await api<{ id: string }>("/widgets", {
        method: "POST",
        body: JSON.stringify({ overlayId: overlayId || null, name: name.trim(), type, width, height })
      });
      router.push(`/dashboard/widgets/edit?id=${widget.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง Widget ไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <DashboardShell title="สร้าง Widget">
      <div className="flex flex-col gap-8">
        <div>
          <p className="text-sm font-medium text-ink-muted">เลือก overlay และชนิด widget เพื่อเริ่มวางตำแหน่งบนหน้าจอสตรีม</p>
          {error ? (
            <div className="mt-4">
              <Notice tone="error">{error}</Notice>
            </div>
          ) : null}
        </div>

      <ResourceCard className="max-w-2xl">
        <form className="space-y-4" onSubmit={submit}>
          <Field label="ชื่อ Widget">
            <Input onChange={(event) => setName(event.target.value)} value={name} />
          </Field>

          <Field label="Overlay">
            <Select onChange={(event) => setOverlayId(event.target.value)} value={overlayId}>
              <option value="">ยังไม่ผูก Overlay</option>
              {overlays.length ? (
                overlays.map((overlay) => (
                  <option key={overlay.id} value={overlay.id}>
                    {overlay.name}
                  </option>
                ))
              ) : null}
            </Select>
          </Field>

          <Field label="ประเภท">
            <Select onChange={(event) => setType(event.target.value)} value={type}>
              {widgetTypes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="กว้าง">
              <Input min={1} onChange={(event) => setWidth(Number(event.target.value))} type="number" value={width} />
            </Field>
            <Field label="สูง">
              <Input min={1} onChange={(event) => setHeight(Number(event.target.value))} type="number" value={height} />
            </Field>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-2 pt-2">
            <Button 
              disabled={busy} 
              type="submit" 
              size="lg" 
              className={`w-full sm:w-auto font-semibold transition-all active:translate-y-1 ${
                isDirty 
                  ? "bg-rose-600 text-white hover:bg-rose-500 border-rose-500 animate-pulse shadow-rose-900/20" 
                  : "bg-primary text-black border-2 border-transparent hover:border-white shadow-none hover:shadow-brutal-sm"
              }`}
            >
              {busy ? "กำลังบันทึก..." : "สร้าง Widget"}
            </Button>
          </div>
        </form>
      </ResourceCard>
      </div>
      {UnsavedChangesModal}
    </DashboardShell>
  );
}
