"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { api } from "../../../lib/api";

type Widget = { id: string; name: string; type: string; overlayId: string };

export default function WidgetsPage() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  useEffect(() => void api<Widget[]>("/widgets").then(setWidgets), []);
  return (
    <DashboardShell title="Widgets">
      <Link className="mb-4 inline-block rounded-md bg-slate-950 px-4 py-2 text-white" href="/dashboard/widgets/new">สร้าง Widget</Link>
      <div className="grid gap-3">
        {widgets.map((widget) => <ResourceCard key={widget.id}><Link className="font-medium underline" href={`/dashboard/widgets/${widget.id}`}>{widget.name}</Link><p className="text-sm text-slate-500">{widget.type}</p></ResourceCard>)}
      </div>
    </DashboardShell>
  );
}
