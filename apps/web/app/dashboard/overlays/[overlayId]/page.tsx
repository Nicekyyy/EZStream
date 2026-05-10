"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { ResourceCard } from "../../../../components/resource-card";
import { API_URL, api } from "../../../../lib/api";

type Overlay = { id: string; name: string; token: string; width: number; height: number };

export default function OverlayDetailPage() {
  const { overlayId } = useParams<{ overlayId: string }>();
  const [overlay, setOverlay] = useState<Overlay>();

  async function load() {
    setOverlay(await api<Overlay>(`/overlays/${overlayId}`));
  }

  useEffect(() => void load(), [overlayId]);

  async function regenerate() {
    setOverlay(await api<Overlay>(`/overlays/${overlayId}/regenerate-token`, { method: "POST" }));
  }

  const url = overlay ? `${API_URL.replace("4000", "3000")}/overlay/${overlay.token}` : "";
  return (
    <DashboardShell title="จัดการ Overlay">
      <ResourceCard>
        <p className="font-medium">{overlay?.name ?? "กำลังโหลด"}</p>
        <p className="break-all text-sm text-slate-600">{url}</p>
        <div className="mt-3 flex gap-2">
          <button className="rounded-md bg-slate-950 px-3 py-2 text-sm text-white" onClick={() => void navigator.clipboard.writeText(url)}>คัดลอก URL</button>
          <button className="rounded-md border px-3 py-2 text-sm" onClick={() => void regenerate()}>Regenerate token</button>
          {overlay ? <Link className="rounded-md border px-3 py-2 text-sm" href={`/overlay/preview/${overlay.token}`}>Preview</Link> : null}
        </div>
      </ResourceCard>
    </DashboardShell>
  );
}
