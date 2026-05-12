"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { ResourceCard } from "../../components/resource-card";
import { LoadingCards, Notice } from "../../components/ui-kit";
import { api } from "../../lib/api";

type DashboardData = {
  user?: { email: string };
  creator?: { slug: string; displayName: string };
  overlays: unknown[];
  widgets: unknown[];
  rules: unknown[];
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState("");
  const loading = !data && !error;

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
      <div className="mb-5">
        <p className="max-w-2xl text-sm leading-6 text-slate-400">จัดการ overlay, widget และ rule automation สำหรับ live stream จากที่เดียว</p>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? (
        <LoadingCards count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Creator" value={data?.creator?.displayName ?? "-"} helper={data?.user?.email} />
          <StatCard label="Overlays" value={data?.overlays.length ?? 0} helper="พื้นที่แสดงผลทั้งหมด" />
          <StatCard label="Widgets" value={data?.widgets.length ?? 0} helper="ชิ้นส่วนที่วางบน overlay" />
          <StatCard label="Rules" value={data?.rules.length ?? 0} helper="automation ที่ตั้งไว้" />
        </div>
      )}
    </DashboardShell>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return (
    <ResourceCard>
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-white">{value}</p>
      {helper ? <p className="mt-1 truncate text-xs text-slate-500">{helper}</p> : null}
    </ResourceCard>
  );
}
