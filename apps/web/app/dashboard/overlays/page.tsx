"use client";

import { Button } from "@ezstream/ui";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { Badge, EmptyState, Field, Input, LoadingCards, Notice, PageActions } from "../../../components/ui-kit";
import { APP_URL, api } from "../../../lib/api";
import { copyText } from "../../../lib/clipboard";
import { ConfirmDeleteModal } from "../../../components/confirm-delete-modal";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "../../../components/icons";

type Overlay = { id: string; name: string; token: string; width: number; height: number; isActive: boolean };

export default function OverlaysPage() {
  const [items, setItems] = useState<Overlay[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingOverlay, setDeletingOverlay] = useState<Overlay | null>(null);

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
      setName("");
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

  function deleteOverlay(overlay: Overlay) {
    setDeletingOverlay(overlay);
  }

  async function confirmDelete() {
    if (!deletingOverlay) return;
    setBusyId(deletingOverlay.id);
    setMessage("");
    setError("");
    try {
      await api(`/overlays/${deletingOverlay.id}`, { method: "DELETE" });
      setMessage("ลบ Overlay แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ Overlay ไม่สำเร็จ");
    } finally {
      setBusyId("");
      setDeletingOverlay(null);
    }
  }

  async function copyUrl(overlay: Overlay) {
    const copied = await copyText(`${APP_URL}/overlay?token=${overlay.token}`);
    if (copied) {
      setError("");
      setMessage("คัดลอก URL แล้ว");
      setCopiedId(overlay.id);
      setTimeout(() => setCopiedId(""), 2000);
    } else {
      setMessage("");
      setError("คัดลอก URL ไม่สำเร็จ");
    }
  }

  return (
    <DashboardShell title="โอเวอร์เลย์">
      <PageActions>
        <p className="max-w-2xl text-sm leading-6 text-slate-400">สร้าง URL สำหรับ OBS หรือ TikTok LIVE Studio และจัดการสถานะของแต่ละ overlay</p>
      </PageActions>

      <ResourceCard className="mb-5">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="ชื่อ Overlay">
            <Input placeholder="เช่น Main Stream, Just Chatting..." value={name} onChange={(event) => setName(event.target.value)} />
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
            <ResourceCard key={overlay.id} className="p-0 overflow-hidden">
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Link className="text-lg font-bold text-white hover:text-primary transition-colors focus-visible:outline-none focus-visible:text-primary" href={`/dashboard/overlays/edit?id=${overlay.id}`}>
                    {overlay.name}
                  </Link>
                  <Badge tone={overlay.isActive ? "success" : "neutral"}>{overlay.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-ink-subtle">
                  <p><span className="text-ink-faint mr-1">ขนาด</span> {overlay.width}x{overlay.height}</p>
                  <p><span className="text-ink-faint mr-1">URL</span> {APP_URL}/overlay?token={overlay.token}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-surface-dark border-t-2 border-border-base p-4 gap-4">
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <button 
                    disabled={busyId === overlay.id} 
                    onClick={() => void copyUrl(overlay)} 
                    className={
                      copiedId === overlay.id
                        ? "flex items-center gap-1.5 text-sm font-bold text-emerald-400 hover:text-emerald-300 focus-visible:outline-none focus-visible:text-emerald-300 transition-colors disabled:opacity-50"
                        : "flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-white focus-visible:outline-none focus-visible:text-white transition-colors disabled:opacity-50"
                    }
                  >
                    {copiedId === overlay.id ? (
                      <>
                        <CheckIcon className="h-4 w-4" /> สำเร็จ!
                      </>
                    ) : (
                      <>
                        <CopyIcon className="h-4 w-4" /> คัดลอก URL
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => window.open(`${APP_URL}/overlay?token=${overlay.token}&bg=green`, `overlay_${overlay.id}`, "popup=1,width=1920,height=1080")} 
                    className="flex items-center gap-1.5 text-sm font-medium text-indigo-400 hover:text-indigo-300 focus-visible:outline-none focus-visible:text-indigo-300 transition-colors"
                  >
                    <ExternalLinkIcon className="h-4 w-4" /> เปิดหน้าต่างแยก (จับจอ)
                  </button>
                  <button disabled={busyId === overlay.id} onClick={() => void toggleActive(overlay)} className="text-sm font-medium text-ink-muted hover:text-white focus-visible:outline-none focus-visible:text-white transition-colors disabled:opacity-50">
                    {overlay.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </button>
                  <button disabled={busyId === overlay.id} onClick={() => void deleteOverlay(overlay)} className="text-sm font-medium text-rose-500 hover:text-rose-400 focus-visible:outline-none focus-visible:text-rose-400 transition-colors disabled:opacity-50">
                    ลบ
                  </button>
                </div>
                <Link href={`/dashboard/overlays/edit?id=${overlay.id}`} className="bg-primary text-surface-base px-6 py-2 text-sm font-semibold hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:border-white transition-all shadow-none hover:shadow-brutal-sm border-2 border-transparent text-center">
                  จัดการ Overlay
                </Link>
              </div>
            </ResourceCard>
          ))}
        </div>
      ) : (
        <EmptyState title="ยังไม่มี Overlay" description="สร้าง overlay แรกเพื่อเริ่มวาง widget และนำ URL ไปใช้ในโปรแกรมสตรีม" />
      )}
      
      <ConfirmDeleteModal 
        isOpen={!!deletingOverlay}
        onClose={() => setDeletingOverlay(null)}
        onConfirm={() => void confirmDelete()}
        title="ลบ Overlay"
        itemName={deletingOverlay?.name ?? ""}
        description="Widget และ Chat Source ใน Overlay นี้จะถูกลบไปด้วย"
      />
    </DashboardShell>
  );
}
