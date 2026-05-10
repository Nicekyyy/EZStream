"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { ResourceCard } from "../../components/resource-card";
import { api } from "../../lib/api";

export default function DashboardPage() {
  const [data, setData] = useState<{ user?: { email: string }; creator?: { slug: string; displayName: string }; overlays: unknown[]; widgets: unknown[]; rules: unknown[] }>();
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ email: string; creator: { slug: string; displayName: string } }>("/auth/me"),
      api<unknown[]>("/overlays"),
      api<unknown[]>("/widgets"),
      api<unknown[]>("/rules")
    ])
      .then(([me, overlays, widgets, rules]) => setData({ user: me, creator: me.creator, overlays, widgets, rules }))
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, []);

  return (
    <DashboardShell title="ภาพรวม">
      {error ? <p className="text-red-600">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-4">
        <ResourceCard><p className="text-sm text-slate-400">Creator</p><p className="text-xl font-semibold">{data?.creator?.displayName ?? "-"}</p></ResourceCard>
        <ResourceCard><p className="text-sm text-slate-400">Overlays</p><p className="text-xl font-semibold">{data?.overlays.length ?? 0}</p></ResourceCard>
        <ResourceCard><p className="text-sm text-slate-400">Widgets</p><p className="text-xl font-semibold">{data?.widgets.length ?? 0}</p></ResourceCard>
        <ResourceCard><p className="text-sm text-slate-400">Rules</p><p className="text-xl font-semibold">{data?.rules.length ?? 0}</p></ResourceCard>
      </div>
    </DashboardShell>
  );
}
