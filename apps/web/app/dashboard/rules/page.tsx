"use client";

import { Button } from "@ezstream/ui";
import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { EmptyState, Field, Input, LoadingCards, Notice } from "../../../components/ui-kit";
import { api } from "../../../lib/api";

type Rule = { id: string; name: string; eventType: string; conditions: unknown; actions: unknown };

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState("Chat hello alert");
  const [eventType, setEventType] = useState("live.chat.message");
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setRules(await api<Rule[]>("/rules"));
  }

  useEffect(() => {
    void load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Rule ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
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
      <ResourceCard className="mb-5">
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="ชื่อ Rule">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Event type">
            <Input value={eventType} onChange={(event) => setEventType(event.target.value)} />
          </Field>
          <Button disabled={submitting || !name.trim() || !eventType.trim()} type="submit">
            {submitting ? "กำลังสร้าง..." : "สร้าง Rule"}
          </Button>
        </form>
      </ResourceCard>

      <div className="mb-4 space-y-3">
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>

      {loading ? (
        <LoadingCards />
      ) : rules.length ? (
        <div className="grid gap-3">
          {rules.map((rule) => (
            <ResourceCard key={rule.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-white">{rule.name}</p>
                  <p className="mt-1 text-sm text-slate-400">{rule.eventType}</p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={deletingId === rule.id}
                  onClick={() => void deleteRule(rule)}
                  type="button"
                >
                  {deletingId === rule.id ? "กำลังลบ..." : "ลบ"}
                </Button>
              </div>
            </ResourceCard>
          ))}
        </div>
      ) : (
        <EmptyState title="ยังไม่มี Rule" description="สร้าง rule เพื่อให้ event จาก live stream ไป trigger widget หรือ TTS โดยอัตโนมัติ" />
      )}
    </DashboardShell>
  );
}
