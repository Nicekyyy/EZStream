"use client";

import { Button } from "@ezstream/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { Badge, EmptyState, Input, LoadingCards, Notice, PageActions } from "../../../components/ui-kit";
import { api } from "../../../lib/api";
import { ConfirmDeleteModal } from "../../../components/confirm-delete-modal";

type Rule = {
  id: string;
  name: string;
  isEnabled: boolean;
  priority: number;
  stopOnMatch: boolean;
  eventTypes: string[];
  conditions: unknown;
  actions: { type: string }[];
  cooldownSeconds: number;
  cooldownScope: string;
  activeFrom: string | null;
  activeTo: string | null;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  "live.chat.message": "แชท",
  "live.gift.received": "ของขวัญ",
  "live.follow.received": "ติดตาม",
  "live.like.received": "ไลก์",
  "live.share.received": "แชร์",
  "live.subscribe.received": "สมัครสมาชิก"
};

function conditionCount(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  const value = node as { all?: unknown[]; any?: unknown[]; field?: string };
  if (value.field) return 1;
  const children = value.all ?? value.any ?? [];
  return children.reduce((sum: number, child) => sum + conditionCount(child), 0);
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingRule, setDeletingRule] = useState<Rule | null>(null);

  async function load() {
    setRules(await api<Rule[]>("/rules"));
  }

  useEffect(() => {
    void load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Rule ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  const filteredRules = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rules;
    return rules.filter((rule) => rule.name.toLowerCase().includes(keyword));
  }, [query, rules]);

  async function toggleEnabled(rule: Rule) {
    setBusyId(rule.id);
    setError("");
    setMessage("");
    try {
      await api<Rule>(`/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ isEnabled: !rule.isEnabled }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปเดต Rule ไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  }

  async function duplicateRule(rule: Rule) {
    setBusyId(rule.id);
    setError("");
    setMessage("");
    try {
      await api("/rules", {
        method: "POST",
        body: JSON.stringify({
          name: `${rule.name} (สำเนา)`,
          isEnabled: rule.isEnabled,
          priority: rule.priority,
          stopOnMatch: rule.stopOnMatch,
          eventTypes: rule.eventTypes,
          conditions: rule.conditions,
          actions: rule.actions,
          cooldownSeconds: rule.cooldownSeconds,
          cooldownScope: rule.cooldownScope,
          activeFrom: rule.activeFrom,
          activeTo: rule.activeTo
        })
      });
      setMessage("คัดลอก Rule แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "คัดลอก Rule ไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  }

  async function confirmDelete() {
    if (!deletingRule) return;
    setBusyId(deletingRule.id);
    setError("");
    setMessage("");
    try {
      await api(`/rules/${deletingRule.id}`, { method: "DELETE" });
      setMessage("ลบ Rule แล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ Rule ไม่สำเร็จ");
    } finally {
      setBusyId("");
      setDeletingRule(null);
    }
  }

  return (
    <DashboardShell title="Rules">
      <PageActions>
        <Input className="sm:max-w-md" onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา Rule" value={query} />
        <Button asChild className="bg-primary text-black border-2 border-transparent hover:border-white shadow-none hover:shadow-brutal-sm transition-all active:translate-y-1 font-semibold">
          <Link href="/dashboard/rules/edit">สร้าง Rule</Link>
        </Button>
      </PageActions>

      <div className="mb-4 space-y-3">
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>

      {loading ? (
        <LoadingCards />
      ) : filteredRules.length ? (
        <div className="grid gap-3">
          {filteredRules.map((rule) => (
            <ResourceCard key={rule.id} className="p-0 overflow-hidden">
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Link className="text-lg font-bold text-white hover:text-primary transition-colors" href={`/dashboard/rules/edit?id=${rule.id}`}>
                    {rule.name}
                  </Link>
                  <Badge tone={rule.isEnabled ? "success" : "neutral"}>{rule.isEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-ink-subtle">
                  <p><span className="text-ink-faint mr-1">TRIGGER</span> {rule.eventTypes.map((type) => EVENT_TYPE_LABELS[type] ?? type).join(", ") || "ไม่มี"}</p>
                  <p><span className="text-ink-faint mr-1">เงื่อนไข</span> {conditionCount(rule.conditions)} ข้อ</p>
                  <p><span className="text-ink-faint mr-1">ACTIONS</span> {rule.actions?.length ?? 0}</p>
                  <p><span className="text-ink-faint mr-1">PRIORITY</span> {rule.priority}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-surface-dark border-t-2 border-border-base p-4 gap-4">
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <button disabled={busyId === rule.id} onClick={() => void toggleEnabled(rule)} className="text-sm font-medium text-ink-muted hover:text-white transition-colors disabled:opacity-50">
                    {rule.isEnabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </button>
                  <button disabled={busyId === rule.id} onClick={() => void duplicateRule(rule)} className="text-sm font-medium text-ink-muted hover:text-white transition-colors disabled:opacity-50">
                    คัดลอก
                  </button>
                  <button disabled={busyId === rule.id} onClick={() => setDeletingRule(rule)} className="text-sm font-medium text-rose-500 hover:text-rose-400 transition-colors disabled:opacity-50">
                    ลบ
                  </button>
                </div>
                <Link href={`/dashboard/rules/edit?id=${rule.id}`} className="bg-primary text-surface-base px-6 py-2 text-sm font-semibold hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-none hover:shadow-brutal-sm border-2 border-transparent text-center">
                  จัดการ Rule
                </Link>
              </div>
            </ResourceCard>
          ))}
        </div>
      ) : (
        <EmptyState
          title={rules.length ? "ไม่พบ Rule ที่ค้นหา" : "ยังไม่มี Rule"}
          description={rules.length ? "ลองเปลี่ยนคำค้นหา" : "สร้าง rule แรกเพื่อกำหนดว่าเมื่อไหร่ควรเล่น alert, เสียง, หรือข้อความบน overlay"}
          action={
            rules.length ? null : (
              <Button asChild className="bg-primary text-black border-2 border-transparent hover:border-white shadow-none hover:shadow-brutal-sm transition-all active:translate-y-1 font-semibold">
                <Link href="/dashboard/rules/edit">สร้าง Rule</Link>
              </Button>
            )
          }
        />
      )}

      <ConfirmDeleteModal
        isOpen={!!deletingRule}
        onClose={() => setDeletingRule(null)}
        onConfirm={() => void confirmDelete()}
        title="ลบ Rule"
        itemName={deletingRule?.name ?? ""}
      />
    </DashboardShell>
  );
}
