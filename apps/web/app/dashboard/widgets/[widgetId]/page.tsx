"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { ResourceCard } from "../../../../components/resource-card";
import { api } from "../../../../lib/api";

type Widget = { id: string; name: string; type: string; state?: { state: unknown } };

export default function WidgetDetailPage() {
  const { widgetId } = useParams<{ widgetId: string }>();
  const [widget, setWidget] = useState<Widget>();
  useEffect(() => void api<Widget>(`/widgets/${widgetId}`).then(setWidget), [widgetId]);
  async function testTrigger() {
    await api(`/widgets/${widgetId}/test-trigger`, { method: "POST" });
    setWidget(await api<Widget>(`/widgets/${widgetId}`));
  }
  return (
    <DashboardShell title="จัดการ Widget">
      <ResourceCard>
        <p className="font-medium">{widget?.name}</p>
        <p className="text-sm text-slate-500">{widget?.type}</p>
        <button className="mt-3 rounded-md bg-slate-950 px-3 py-2 text-sm text-white" onClick={() => void testTrigger()}>Test Trigger</button>
      </ResourceCard>
    </DashboardShell>
  );
}
