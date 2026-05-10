"use client";

import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { api } from "../../../lib/api";

type Rule = { id: string; name: string; eventType: string; conditions: unknown; actions: unknown };

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState("Chat hello alert");
  const [eventType, setEventType] = useState("live.chat.message");
  async function load() { setRules(await api<Rule[]>("/rules")); }
  useEffect(() => void load(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const widgets = await api<{ id: string; type: string }[]>("/widgets");
    const alertWidget = widgets.find((widget) => widget.type === "ALERT_WIDGET") ?? widgets[0];
    if (!alertWidget) return;
    await api("/rules", {
      method: "POST",
      body: JSON.stringify({
        name,
        eventType,
        conditions: [{ field: "message", operator: "contains", value: "!hello" }],
        actions: [{ type: "SHOW_ALERT", widgetId: alertWidget.id, textTemplate: "{username}: {message}" }]
      })
    });
    await load();
  }
  return (
    <DashboardShell title="Rules">
      <form onSubmit={submit} className="mb-4 grid gap-2 rounded-md border bg-white p-4 md:grid-cols-[1fr_1fr_auto]">
        <input className="rounded-md border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded-md border px-3 py-2" value={eventType} onChange={(e) => setEventType(e.target.value)} />
        <button className="rounded-md bg-slate-950 px-4 py-2 text-white">สร้าง Rule</button>
      </form>
      <div className="grid gap-3">{rules.map((rule) => <ResourceCard key={rule.id}><p className="font-medium">{rule.name}</p><p className="text-sm text-slate-500">{rule.eventType}</p></ResourceCard>)}</div>
    </DashboardShell>
  );
}
