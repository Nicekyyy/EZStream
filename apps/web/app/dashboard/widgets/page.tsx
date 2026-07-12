"use client";

import { Button } from "@ezstream/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { Badge, EmptyState, Input, LoadingCards, Notice, PageActions } from "../../../components/ui-kit";
import { APP_URL, api } from "../../../lib/api";
import { copyText } from "../../../lib/clipboard";
import { ConfirmDeleteModal } from "../../../components/confirm-delete-modal";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "../../../components/icons";
import { isAudioOnlyWidgetType } from "../../../lib/widget-types";

type Widget = {
  id: string;
  name: string;
  type: string;
  overlayId: string | null;
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
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingWidget, setDeletingWidget] = useState<Widget | null>(null);

  async function load() {
    setWidgets(await api<Widget[]>("/widgets"));
  }

  useEffect(() => {
    void load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Widget ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  const filteredWidgets = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return widgets;
    return widgets.filter((widget) =>
      [widget.name, widget.type, widget.overlay?.name ?? "", widget.overlayId ? "" : "ยังไม่ผูก overlay"].some((value) => value.toLowerCase().includes(keyword))
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

  function deleteWidget(widget: Widget) {
    setDeletingWidget(widget);
  }

  async function confirmDelete() {
    if (!deletingWidget) return;
    setBusyId(deletingWidget.id);
    setError("");
    setMessage("");
    try {
      await api(`/widgets/${deletingWidget.id}`, { method: "DELETE" });
      setMessage("ลบ Widget แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ Widget ไม่สำเร็จ");
    } finally {
      setBusyId("");
      setDeletingWidget(null);
    }
  }

  async function copyWidgetUrl(widget: Widget) {
    const copied = await copyText(`${APP_URL}/widget?id=${widget.id}`);
    if (copied) {
      setError("");
      setMessage("คัดลอก Widget URL แล้ว");
      setCopiedId(widget.id);
      setTimeout(() => setCopiedId(""), 2000);
    } else {
      setMessage("");
      setError("คัดลอก Widget URL ไม่สำเร็จ");
    }
  }

  return (
    <DashboardShell title="วิดเจ็ต">
      <PageActions>
        <Input
          className="sm:max-w-md"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ค้นหา Widget, type หรือ overlay"
          value={query}
        />
        <Button asChild className="bg-primary text-black border-2 border-transparent hover:border-white shadow-none hover:shadow-brutal-sm transition-all active:translate-y-1 font-semibold">
          <Link href="/dashboard/widgets/new">สร้าง Widget</Link>
        </Button>
      </PageActions>

      <div className="mb-4 space-y-3">
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>

      {loading ? (
        <LoadingCards />
      ) : filteredWidgets.length ? (
        <div className="grid gap-3">
          {filteredWidgets.map((widget) => (
            <ResourceCard key={widget.id} className="p-0 overflow-hidden">
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Link className="text-lg font-bold text-white hover:text-primary transition-colors focus-visible:outline-none focus-visible:text-primary" href={`/dashboard/widgets/edit?id=${widget.id}`}>
                    {widget.name}
                  </Link>
                  <Badge tone={widget.isEnabled ? "success" : "neutral"}>{widget.isEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge>
                  <Badge tone={widget.visibility ? "info" : "neutral"}>{widget.visibility ? "แสดงบน Overlay" : "ซ่อนบน Overlay"}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-ink-subtle">
                  <p><span className="text-ink-faint mr-1">ประเภท</span> {widget.type}</p>
                  <p><span className="text-ink-faint mr-1">โอเวอร์เลย์</span> {widget.overlay?.name ?? "ยังไม่ผูก"}</p>
                  <p><span className="text-ink-faint mr-1">ตำแหน่ง</span> X {widget.positionX}, Y {widget.positionY}</p>
                  {isAudioOnlyWidgetType(widget.type) ? null : (
                    <p><span className="text-ink-faint mr-1">ขนาด</span> {widget.width}x{widget.height}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-surface-dark border-t-2 border-border-base p-4 gap-4">
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <button 
                    disabled={busyId === widget.id} 
                    onClick={() => void copyWidgetUrl(widget)} 
                    className={
                      copiedId === widget.id
                        ? "flex items-center gap-1.5 text-sm font-bold text-emerald-400 hover:text-emerald-300 focus-visible:outline-none focus-visible:text-emerald-300 transition-colors disabled:opacity-50"
                        : "flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-white focus-visible:outline-none focus-visible:text-white transition-colors disabled:opacity-50"
                    }
                  >
                    {copiedId === widget.id ? (
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
                    onClick={() => window.open(`${APP_URL}/widget?id=${widget.id}&bg=green`, `widget_${widget.id}`, "popup=1,width=800,height=600")} 
                    className="flex items-center gap-1.5 text-sm font-medium text-indigo-400 hover:text-indigo-300 focus-visible:outline-none focus-visible:text-indigo-300 transition-colors"
                  >
                    <ExternalLinkIcon className="h-4 w-4" /> เปิดหน้าต่างแยก
                  </button>
                  <button disabled={busyId === widget.id} onClick={() => void updateWidget(widget, { isEnabled: !widget.isEnabled })} className="text-sm font-medium text-ink-muted hover:text-white focus-visible:outline-none focus-visible:text-white transition-colors disabled:opacity-50">
                    {widget.isEnabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </button>
                  {isAudioOnlyWidgetType(widget.type) ? null : (
                    <button disabled={busyId === widget.id} onClick={() => void updateWidget(widget, { visibility: !widget.visibility })} className="text-sm font-medium text-ink-muted hover:text-white focus-visible:outline-none focus-visible:text-white transition-colors disabled:opacity-50">
                      {widget.visibility ? "ซ่อน" : "แสดง"}
                    </button>
                  )}
                  <button disabled={busyId === widget.id} onClick={() => void deleteWidget(widget)} className="text-sm font-medium text-rose-500 hover:text-rose-400 focus-visible:outline-none focus-visible:text-rose-400 transition-colors disabled:opacity-50">
                    ลบ
                  </button>
                </div>
                <Link href={`/dashboard/widgets/edit?id=${widget.id}`} className="bg-primary text-surface-base px-6 py-2 text-sm font-semibold hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:border-white transition-all shadow-none hover:shadow-brutal-sm border-2 border-transparent text-center">
                  จัดการ Widget
                </Link>
              </div>
            </ResourceCard>
          ))}
        </div>
      ) : (
        <EmptyState
          title={widgets.length ? "ไม่พบ Widget ที่ค้นหา" : "ยังไม่มี Widget"}
          description={widgets.length ? "ลองเปลี่ยนคำค้นหา หรือเคลียร์ช่องค้นหาเพื่อดูทั้งหมด" : "สร้าง widget แรกเพื่อเริ่มแสดง alert, chat, TTS หรือ content บน overlay"}
          action={
            widgets.length ? null : (
              <Button asChild className="bg-primary text-black border-2 border-transparent hover:border-white shadow-none hover:shadow-brutal-sm transition-all active:translate-y-1 font-semibold">
                <Link href="/dashboard/widgets/new">สร้าง Widget</Link>
              </Button>
            )
          }
        />
      )}
      
      <ConfirmDeleteModal 
        isOpen={!!deletingWidget}
        onClose={() => setDeletingWidget(null)}
        onConfirm={() => void confirmDelete()}
        title="ลบ Widget"
        itemName={deletingWidget?.name ?? ""}
      />
    </DashboardShell>
  );
}
