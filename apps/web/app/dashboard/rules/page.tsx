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
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setRules(await api<Rule[]>("/rules"));
  }

  useEffect(() => void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Rule ไม่สำเร็จ")), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      const widgets = await api<{ id: string; type: string }[]>("/widgets");
      const alertWidget = widgets.find((widget) => widget.type === "ALERT_WIDGET") ?? widgets[0];
      if (!alertWidget) {
        setError("ต้องมี Widget ก่อนสร้าง Rule");
        return;
      }
      await api("/rules", {
        method: "POST",
        body: JSON.stringify({
          name,
          eventType,
          conditions: [{ field: "message", operator: "contains", value: "!hello" }],
          actions: [{ type: "SHOW_ALERT", widgetId: alertWidget.id, textTemplate: "{username}: {message}" }]
        })
      });
      setMessage("สร้าง Rule แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง Rule ไม่สำเร็จ");
    }
  }

  async function deleteRule(rule: Rule) {
    if (!window.confirm(`ลบ Rule "${rule.name}"?`)) return;
    setDeletingId(rule.id);
    setMessage("");
    setError("");
    try {
      await api(`/rules/${rule.id}`, { method: "DELETE" });
      setMessage("ลบ Rule แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ Rule ไม่สำเร็จ");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <DashboardShell title="Rules">
      <form onSubmit={submit} className="mb-4 grid gap-2 rounded-md border border-slate-800 bg-slate-900 p-4 md:grid-cols-[1fr_1fr_auto]">
        <input className="rounded-md border border-slate-800 px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} />
        <input className="rounded-md border border-slate-800 px-3 py-2" value={eventType} onChange={(event) => setEventType(event.target.value)} />
        <button className="rounded-md bg-slate-950 px-4 py-2 text-white">สร้าง Rule</button>
      </form>

      {message ? <p className="mb-3 text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="mb-3 text-sm text-rose-400">{error}</p> : null}

      <div className="grid gap-3">
        {rules.map((rule) => (
          <ResourceCard key={rule.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{rule.name}</p>
                <p className="text-sm text-slate-400">{rule.eventType}</p>
              </div>
              <button
                className="rounded-md border border-rose-800 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-950 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={deletingId === rule.id}
                onClick={() => void deleteRule(rule)}
                type="button"
              >
                {deletingId === rule.id ? "กำลังลบ..." : "ลบ"}
              </button>
            </div>
          </ResourceCard>
        ))}
      </div>
    </DashboardShell>
  );
}
