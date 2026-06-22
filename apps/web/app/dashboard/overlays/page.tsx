"use client";

import { Button } from "@ezstream/ui";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { Badge, EmptyState, Field, Input, LoadingCards, Notice, PageActions } from "../../../components/ui-kit";
import { APP_URL, api } from "../../../lib/api";
import { copyText } from "../../../lib/clipboard";

type Overlay = { id: string; name: string; token: string; width: number; height: number; isActive: boolean };

export default function OverlaysPage() {
  const [items, setItems] = useState<Overlay[]>([]);
  const [name, setName] = useState("New Overlay");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setItems(await api<Overlay[]>("/overlays"));
  }

  useEffect(() => {
    void load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Overlay ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setCreating(true);
    try {
      await api("/overlays", { method: "POST", body: JSON.stringify({ name, width: 1920, height: 1080 }) });
      setMessage("สร้าง Overlay แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง Overlay ไม่สำเร็จ");
    } finally {
      setCreating(false);
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
    if (!window.confirm(`ลบ Overlay "${overlay.name}"? Widget และ Chat Source ใน Overlay นี้จะถูกลบไปด้วย`)) return;
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
    const copied = await copyText(`${APP_URL}/overlay?token=${overlay.token}`);
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
      <PageActions>
        <p className="max-w-2xl text-sm leading-6 text-slate-400">สร้าง URL สำหรับ OBS หรือ TikTok LIVE Studio และจัดการสถานะของแต่ละ overlay</p>
      </PageActions>

      <ResourceCard className="mb-5">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="ชื่อ Overlay">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Button disabled={creating || !name.trim()} type="submit">
            {creating ? "กำลังสร้าง..." : "สร้าง Overlay"}
          </Button>
        </form>
      </ResourceCard>

      <div className="mb-4 space-y-3">
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>

      {loading ? (
        <LoadingCards />
      ) : items.length ? (
        <div className="grid gap-3">
          {items.map((overlay) => (
            <ResourceCard key={overlay.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white">{overlay.name}</p>
                    <Badge tone={overlay.isActive ? "success" : "neutral"}>{overlay.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">
                    {overlay.width} x {overlay.height}
                  </p>
                  <p className="mt-1 break-all text-sm text-slate-500">{APP_URL}/overlay?token={overlay.token}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busyId === overlay.id} onClick={() => void toggleActive(overlay)} type="button">
                    {overlay.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busyId === overlay.id} onClick={() => void copyUrl(overlay)} type="button">
                    คัดลอก URL
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/dashboard/overlays/edit?id=${overlay.id}`}>จัดการ</Link>
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busyId === overlay.id} onClick={() => void deleteOverlay(overlay)} type="button">
                    ลบ
                  </Button>
                </div>
              </div>
            </ResourceCard>
          ))}
        </div>
      ) : (
        <EmptyState title="ยังไม่มี Overlay" description="สร้าง overlay แรกเพื่อเริ่มวาง widget และนำ URL ไปใช้ในโปรแกรมสตรีม" />
      )}
    </DashboardShell>
  );
}
