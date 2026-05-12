"use client";

import { Button } from "@ezstream/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { Badge, EmptyState, Input, LoadingCards, Notice, PageActions } from "../../../components/ui-kit";
import { APP_URL, api } from "../../../lib/api";
import { copyText } from "../../../lib/clipboard";

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
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

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
    const copied = await copyText(`${APP_URL}/widget/${widget.id}`);
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
      <PageActions>
        <Input
          className="sm:max-w-md"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ค้นหา Widget, type หรือ overlay"
          value={query}
        />
        <Button asChild>
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
            <ResourceCard key={widget.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="font-medium text-white hover:text-indigo-200" href={`/dashboard/widgets/${widget.id}`}>
                      {widget.name}
                    </Link>
                    <Badge tone={widget.isEnabled ? "success" : "neutral"}>{widget.isEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge>
                    <Badge tone={widget.visibility ? "info" : "neutral"}>{widget.visibility ? "แสดงบน Overlay" : "ซ่อนบน Overlay"}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">
                    {widget.type} · {widget.overlay?.name ?? "ยังไม่ผูก Overlay"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    X {widget.positionX}, Y {widget.positionY}, {widget.width} x {widget.height}, Layer {widget.zIndex}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busyId === widget.id} onClick={() => void updateWidget(widget, { isEnabled: !widget.isEnabled })} type="button">
                    {widget.isEnabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busyId === widget.id} onClick={() => void updateWidget(widget, { visibility: !widget.visibility })} type="button">
                    {widget.visibility ? "ซ่อน" : "แสดง"}
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/dashboard/widgets/${widget.id}`}>จัดการ</Link>
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busyId === widget.id} onClick={() => void copyWidgetUrl(widget)} type="button">
                    คัดลอก URL
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busyId === widget.id} onClick={() => void deleteWidget(widget)} type="button">
                    ลบ
                  </Button>
                </div>
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
              <Button asChild>
                <Link href="/dashboard/widgets/new">สร้าง Widget</Link>
              </Button>
            )
          }
        />
      )}
    </DashboardShell>
  );
}
