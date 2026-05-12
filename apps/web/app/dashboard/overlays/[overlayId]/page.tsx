"use client";

import { Button } from "@ezstream/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { ResourceCard } from "../../../../components/resource-card";
import { Badge, Field, Input, Notice } from "../../../../components/ui-kit";
import { APP_URL, api } from "../../../../lib/api";
import { copyText } from "../../../../lib/clipboard";

type Overlay = {
  id: string;
  name: string;
  token: string;
  width: number;
  height: number;
  isActive: boolean;
};

export default function OverlayDetailPage() {
  const { overlayId } = useParams<{ overlayId: string }>();
  const router = useRouter();
  const [overlay, setOverlay] = useState<Overlay>();
  const [draftName, setDraftName] = useState("");
  const [draftWidth, setDraftWidth] = useState(1920);
  const [draftHeight, setDraftHeight] = useState(1080);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const url = overlay && APP_URL ? `${APP_URL}/overlay/${overlay.token}` : "";

  async function load() {
    try {
      setError("");
      const nextOverlay = await api<Overlay>(`/overlays/${overlayId}`);
      setOverlay(nextOverlay);
      setDraftName(nextOverlay.name);
      setDraftWidth(nextOverlay.width);
      setDraftHeight(nextOverlay.height);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลด Overlay ไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
  }, [overlayId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) {
      setError("กรุณาใส่ชื่อ Overlay");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setMessage("");
      const nextOverlay = await api<Overlay>(`/overlays/${overlayId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, width: draftWidth, height: draftHeight })
      });
      setOverlay(nextOverlay);
      setMessage("บันทึก Overlay แล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึก Overlay ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!overlay) return;
    try {
      setBusy(true);
      setError("");
      setMessage("");
      const nextOverlay = await api<Overlay>(`/overlays/${overlayId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !overlay.isActive })
      });
      setOverlay(nextOverlay);
      setMessage(nextOverlay.isActive ? "เปิดใช้งาน Overlay แล้ว" : "ปิดใช้งาน Overlay แล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนสถานะ Overlay ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    try {
      setBusy(true);
      setError("");
      setMessage("");
      setOverlay(await api<Overlay>(`/overlays/${overlayId}/regenerate-token`, { method: "POST" }));
      setMessage("สร้าง URL ใหม่แล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง URL ใหม่ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    const copied = await copyText(url);
    if (copied) {
      setError("");
      setMessage("คัดลอก URL แล้ว");
    } else {
      setMessage("");
      setError("คัดลอก URL ไม่สำเร็จ");
    }
  }

  async function removeOverlay() {
    if (!overlay) return;
    const confirmed = window.confirm(`ลบ Overlay "${overlay.name}"?\nWidget และ Live Source ใน Overlay นี้จะถูกลบตามไปด้วย`);
    if (!confirmed) return;

    try {
      setBusy(true);
      setError("");
      await api(`/overlays/${overlayId}`, { method: "DELETE" });
      router.push("/dashboard/overlays");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ Overlay ไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <DashboardShell title="จัดการ Overlay">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/overlays">กลับไปหน้า Overlays</Link>
        </Button>
      </div>

      <div className="mb-4 space-y-3">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {message ? <Notice tone="success">{message}</Notice> : null}
      </div>

      <ResourceCard>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-medium text-white">{overlay?.name ?? "กำลังโหลด"}</p>
            <p className="mt-1 text-sm text-slate-400">
              {overlay ? `${overlay.width} x ${overlay.height}` : "กำลังโหลดข้อมูล Overlay"}
            </p>
          </div>
          {overlay ? <Badge tone={overlay.isActive ? "success" : "neutral"}>{overlay.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge> : null}
        </div>

        <form className="grid gap-4 md:grid-cols-[1fr_140px_140px_auto] md:items-end" onSubmit={(event) => void save(event)}>
          <Field label="ชื่อ Overlay">
            <Input disabled={busy || !overlay} onChange={(event) => setDraftName(event.target.value)} value={draftName} />
          </Field>
          <Field label="กว้าง">
            <Input disabled={busy || !overlay} min={320} onChange={(event) => setDraftWidth(Number(event.target.value))} type="number" value={draftWidth} />
          </Field>
          <Field label="สูง">
            <Input disabled={busy || !overlay} min={180} onChange={(event) => setDraftHeight(Number(event.target.value))} type="number" value={draftHeight} />
          </Field>
          <Button disabled={busy || !overlay} type="submit">
            บันทึก
          </Button>
        </form>
      </ResourceCard>

      <div className="mt-4">
        <ResourceCard>
          <p className="font-medium text-white">URL สำหรับ OBS / Stream Overlay</p>
          <p className="mt-2 break-all rounded-md bg-slate-950/70 px-3 py-2 text-sm text-slate-400">{url || "กำลังโหลด URL"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || !url} onClick={() => void copyUrl()} type="button">
              คัดลอก URL
            </Button>
            <Button size="sm" variant="secondary" disabled={busy || !overlay} onClick={() => void regenerate()} type="button">
              สร้าง URL ใหม่
            </Button>
            {overlay ? (
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/overlay/preview/${overlay.token}`}>Preview</Link>
              </Button>
            ) : null}
          </div>
        </ResourceCard>
      </div>

      {overlay && url ? (
        <div className="mt-4">
          <ResourceCard>
            <p className="mb-3 font-medium text-white">Live Preview</p>
            <div
              className="relative overflow-auto rounded-lg border border-slate-800 bg-slate-950"
              style={{
                backgroundImage:
                  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><rect width='10' height='10' fill='%231e293b'/><rect x='10' y='10' width='10' height='10' fill='%231e293b'/><rect x='10' width='10' height='10' fill='%230f172a'/><rect y='10' width='10' height='10' fill='%230f172a'/></svg>")`,
                maxHeight: "500px"
              }}
            >
              <iframe src={url} style={{ width: draftWidth || 1920, height: draftHeight || 1080, border: "none", display: "block" }} title="Overlay Preview" />
            </div>
          </ResourceCard>
        </div>
      ) : null}

      <div className="mt-4">
        <ResourceCard>
          <p className="font-medium text-white">การจัดการ</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy || !overlay} onClick={() => void toggleActive()} type="button">
              {overlay?.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
            </Button>
            <Button size="sm" variant="destructive" disabled={busy || !overlay} onClick={() => void removeOverlay()} type="button">
              ลบ Overlay
            </Button>
          </div>
        </ResourceCard>
      </div>
    </DashboardShell>
  );
}
