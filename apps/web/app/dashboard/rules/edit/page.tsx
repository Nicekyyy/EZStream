"use client";

import { Button } from "@ezstream/ui";
import { conditionOperators, ruleActionTypes } from "@ezstream/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useId, useMemo, useState } from "react";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { ResourceCard } from "../../../../components/resource-card";
import { Badge, Field, Input, Notice, Select, Textarea } from "../../../../components/ui-kit";
import { ToggleField } from "../../../../components/widget-settings/fields";
import { api } from "../../../../lib/api";
import { useUnsavedChangesWarning } from "../../../../lib/use-unsaved-changes-warning";

type ConditionLeaf = { field: string; operator: string; value: string };
type ConditionGroup = { all: ConditionNode[] } | { any: ConditionNode[] };
type ConditionNode = ConditionLeaf | ConditionGroup;

type RuleAction = {
  type: string;
  widgetId?: string;
  mediaAssetId?: string;
  textTemplate?: string;
  durationMs?: number;
  amount?: string;
  pick?: number;
  actions?: RuleAction[];
};

type Widget = { id: string; name: string; type: string };
type MediaAsset = { id: string; originalName: string; type: string };
type TraceEntry = { field: string; operator: string; expected: unknown; actual: unknown; passed: boolean };

type RuleDetail = {
  name: string;
  isEnabled: boolean;
  priority: number;
  stopOnMatch: boolean;
  eventTypes: string[];
  conditions: ConditionGroup;
  actions: RuleAction[];
  cooldownSeconds: number;
  cooldownScope: string;
  activeFrom: string | null;
  activeTo: string | null;
};

const EVENT_TYPE_OPTIONS = [
  { value: "live.chat.message", label: "ข้อความแชท" },
  { value: "live.gift.received", label: "ได้รับของขวัญ" },
  { value: "live.follow.received", label: "มีผู้ติดตามใหม่" },
  { value: "live.like.received", label: "ได้รับไลก์" },
  { value: "live.share.received", label: "มีการแชร์" },
  { value: "live.subscribe.received", label: "สมัครสมาชิกใหม่" }
];

const FIELD_OPTIONS: Record<string, string[]> = {
  "live.chat.message": ["message", "username", "displayName"],
  "live.gift.received": ["giftName", "repeatCount", "coins", "username", "displayName"],
  "live.follow.received": ["username", "displayName"],
  "live.like.received": ["likeCount", "totalLikeCount", "username", "displayName"],
  "live.share.received": ["username", "displayName"],
  "live.subscribe.received": ["username", "displayName"]
};

const ACTION_WIDGET_TYPE: Record<string, string> = {
  SHOW_ALERT: "ALERT_WIDGET",
  SPEAK_TTS: "TTS_WIDGET",
  PLAY_SOUND: "SOUND_WIDGET",
  SHOW_IMAGE: "IMAGE_WIDGET",
  UPDATE_TEXT: "TEXT_WIDGET",
  UPDATE_GOAL: "GOAL_WIDGET",
  APPEND_EVENT_LIST: "EVENT_LIST_WIDGET"
};

const SAMPLE_PAYLOADS: Record<string, Record<string, unknown>> = {
  "live.chat.message": { username: "tester", displayName: "Tester", message: "!hello สวัสดี" },
  "live.gift.received": { username: "tester", displayName: "Tester", giftName: "Rose", repeatCount: 5, coins: 100 },
  "live.follow.received": { username: "tester", displayName: "Tester" },
  "live.like.received": { username: "tester", displayName: "Tester", likeCount: 10, totalLikeCount: 500 },
  "live.share.received": { username: "tester", displayName: "Tester" },
  "live.subscribe.received": { username: "tester", displayName: "Tester" }
};

function isGroup(node: ConditionNode): node is ConditionGroup {
  return "all" in node || "any" in node;
}

function groupKind(node: ConditionGroup): "all" | "any" {
  return "all" in node ? "all" : "any";
}

function groupChildren(node: ConditionGroup): ConditionNode[] {
  return "all" in node ? node.all : node.any;
}

function withChildren(node: ConditionGroup, children: ConditionNode[]): ConditionGroup {
  return groupKind(node) === "all" ? { all: children } : { any: children };
}

function ConditionGroupEditor({
  node,
  fields,
  onChange,
  onRemove
}: {
  node: ConditionGroup;
  fields: string[];
  onChange: (next: ConditionGroup) => void;
  onRemove?: () => void;
}) {
  const kind = groupKind(node);
  const children = groupChildren(node);

  function updateChild(index: number, next: ConditionNode) {
    const nextChildren = [...children];
    nextChildren[index] = next;
    onChange(withChildren(node, nextChildren));
  }

  function removeChild(index: number) {
    onChange(withChildren(node, children.filter((_, i) => i !== index)));
  }

  function addCondition() {
    onChange(withChildren(node, [...children, { field: fields[0] ?? "username", operator: "equals", value: "" }]));
  }

  function addGroup() {
    onChange(withChildren(node, [...children, { all: [] }]));
  }

  return (
    <div className="space-y-3 border-2 border-border-base bg-surface-dark p-4">
      <div className="flex items-center justify-between gap-2">
        <Select
          className="max-w-[200px]"
          value={kind}
          onChange={(event) => onChange(event.target.value === "all" ? { all: children } : { any: children })}
        >
          <option value="all">ต้องตรงทุกข้อ (AND)</option>
          <option value="any">ตรงข้อใดข้อหนึ่ง (OR)</option>
        </Select>
        {onRemove ? (
          <button type="button" onClick={onRemove} className="text-xs font-semibold text-rose-500 hover:text-rose-400">
            ลบกลุ่มนี้
          </button>
        ) : null}
      </div>

      {children.map((child, index) =>
        isGroup(child) ? (
          <ConditionGroupEditor
            key={index}
            node={child}
            fields={fields}
            onChange={(next) => updateChild(index, next)}
            onRemove={() => removeChild(index)}
          />
        ) : (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Select
              className="max-w-[160px]"
              value={fields.includes(child.field) ? child.field : "__custom__"}
              onChange={(event) => updateChild(index, { ...child, field: event.target.value === "__custom__" ? "" : event.target.value })}
            >
              {fields.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
              <option value="__custom__">กำหนดเอง...</option>
            </Select>
            {!fields.includes(child.field) ? (
              <Input
                className="max-w-[140px]"
                placeholder="ชื่อ field"
                value={child.field}
                onChange={(event) => updateChild(index, { ...child, field: event.target.value })}
              />
            ) : null}
            <Select className="max-w-[190px]" value={child.operator} onChange={(event) => updateChild(index, { ...child, operator: event.target.value })}>
              {conditionOperators.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </Select>
            {child.operator !== "exists" ? (
              <Input
                className="max-w-[180px]"
                placeholder={child.operator === "in" ? "ค่า1, ค่า2, ..." : "ค่า"}
                value={child.value}
                onChange={(event) => updateChild(index, { ...child, value: event.target.value })}
              />
            ) : null}
            <button type="button" onClick={() => removeChild(index)} className="text-xs font-semibold text-rose-500 hover:text-rose-400">
              ลบ
            </button>
          </div>
        )
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={addCondition} className="text-xs font-semibold text-primary hover:opacity-80">
          + เพิ่มเงื่อนไข
        </button>
        <button type="button" onClick={addGroup} className="text-xs font-semibold text-primary hover:opacity-80">
          + เพิ่มกลุ่มย่อย
        </button>
      </div>
    </div>
  );
}

function insertFieldToken(elementId: string, current: string, token: string, onChange: (next: string) => void) {
  const el = document.getElementById(elementId) as HTMLInputElement | HTMLTextAreaElement | null;
  const start = el?.selectionStart ?? current.length;
  const end = el?.selectionEnd ?? current.length;
  onChange(current.slice(0, start) + token + current.slice(end));
  requestAnimationFrame(() => {
    const pos = start + token.length;
    el?.focus();
    el?.setSelectionRange(pos, pos);
  });
}

function FieldChips({ elementId, fields, current, onChange }: { elementId: string; fields: string[]; current: string; onChange: (next: string) => void }) {
  if (fields.length === 0) {
    return <p className="mt-1.5 text-xs text-ink-faint">เลือก Trigger event ก่อนเพื่อดู field ที่ใช้ได้</p>;
  }
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {fields.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => insertFieldToken(elementId, current, `{${f}}`, onChange)}
          className="rounded-none border border-border-base bg-surface-card px-2 py-0.5 font-mono text-[11px] text-ink-muted hover:border-primary hover:text-primary"
        >
          {`{${f}}`}
        </button>
      ))}
    </div>
  );
}

function ActionEditor({
  action,
  widgets,
  mediaAssets,
  availableFields,
  onChange,
  onRemove,
  isRandomChild
}: {
  action: RuleAction;
  widgets: Widget[];
  mediaAssets: MediaAsset[];
  availableFields: string[];
  onChange: (next: RuleAction) => void;
  onRemove: () => void;
  isRandomChild: boolean;
}) {
  const textFieldId = useId();
  const amountFieldId = useId();
  const requiredWidgetType = action.type === "SPEAK_TTS" ? "TTS_WIDGET" : ACTION_WIDGET_TYPE[action.type];
  const compatibleWidgets = requiredWidgetType ? widgets.filter((w) => w.type === requiredWidgetType) : [];
  const needsMedia = action.type === "PLAY_SOUND" || action.type === "SHOW_IMAGE";
  const mediaType = action.type === "PLAY_SOUND" ? "AUDIO" : "IMAGE";
  const needsText = ["SHOW_ALERT", "SPEAK_TTS", "UPDATE_TEXT", "APPEND_EVENT_LIST"].includes(action.type);
  const needsDuration = action.type === "SHOW_ALERT" || action.type === "SHOW_IMAGE";
  const needsAmount = action.type === "UPDATE_GOAL";

  return (
    <div className="space-y-3 border-2 border-border-base bg-surface-dark p-4">
      <div className="flex items-center justify-between gap-2">
        <Select className="max-w-[220px]" value={action.type} onChange={(event) => onChange({ type: event.target.value })}>
          {ruleActionTypes
            .filter((type) => type !== "TRIGGER_WIDGET")
            .filter((type) => !isRandomChild || type !== "RANDOM")
            .map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
        </Select>
        <button type="button" onClick={onRemove} className="text-xs font-semibold text-rose-500 hover:text-rose-400">
          ลบ Action
        </button>
      </div>

      {action.type === "RANDOM" ? (
        <RandomActionEditor action={action} widgets={widgets} mediaAssets={mediaAssets} availableFields={availableFields} onChange={onChange} />
      ) : (
        <>
          {requiredWidgetType ? (
            <Field label={`Widget (${requiredWidgetType})`}>
              <Select value={action.widgetId ?? ""} onChange={(event) => onChange({ ...action, widgetId: event.target.value })}>
                <option value="">เลือก Widget</option>
                {compatibleWidgets.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </Select>
              {compatibleWidgets.length === 0 ? (
                <p className="mt-1 text-xs text-amber-400">ยังไม่มี {requiredWidgetType} — สร้างที่หน้า Widgets ก่อน</p>
              ) : null}
            </Field>
          ) : null}

          {needsMedia ? (
            <Field label={`ไฟล์สื่อ (${mediaType === "AUDIO" ? "เสียง" : "รูปภาพ"})`}>
              <Select value={action.mediaAssetId ?? ""} onChange={(event) => onChange({ ...action, mediaAssetId: event.target.value })}>
                <option value="">เลือกไฟล์</option>
                {mediaAssets
                  .filter((a) => a.type === mediaType)
                  .map((a) => (
                    <option key={a.id} value={a.id}>{a.originalName}</option>
                  ))}
              </Select>
            </Field>
          ) : null}

          {needsText ? (
            <Field label="ข้อความ" hint="ใช้ {field} แทนค่าจาก event">
              <Textarea
                id={textFieldId}
                rows={2}
                value={action.textTemplate ?? ""}
                onChange={(event) => onChange({ ...action, textTemplate: event.target.value })}
              />
              <FieldChips
                elementId={textFieldId}
                fields={availableFields}
                current={action.textTemplate ?? ""}
                onChange={(next) => onChange({ ...action, textTemplate: next })}
              />
            </Field>
          ) : null}

          {needsDuration ? (
            <Field label="ระยะเวลาแสดง (วินาที)">
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={(action.durationMs ?? 5000) / 1000}
                onChange={(event) => onChange({ ...action, durationMs: Math.round(Number(event.target.value) * 1000) })}
              />
            </Field>
          ) : null}

          {needsAmount ? (
            <Field label="จำนวนที่เพิ่ม" hint="ใส่ตัวเลข หรือ {field}">
              <Input
                id={amountFieldId}
                value={action.amount ?? "1"}
                onChange={(event) => onChange({ ...action, amount: event.target.value })}
              />
              <FieldChips
                elementId={amountFieldId}
                fields={availableFields}
                current={action.amount ?? "1"}
                onChange={(next) => onChange({ ...action, amount: next })}
              />
            </Field>
          ) : null}
        </>
      )}
    </div>
  );
}

function RandomActionEditor({
  action,
  widgets,
  mediaAssets,
  availableFields,
  onChange
}: {
  action: RuleAction;
  widgets: Widget[];
  mediaAssets: MediaAsset[];
  availableFields: string[];
  onChange: (next: RuleAction) => void;
}) {
  const children = action.actions ?? [];

  function updateChild(index: number, next: RuleAction) {
    const nextChildren = [...children];
    nextChildren[index] = next;
    onChange({ ...action, actions: nextChildren });
  }

  function removeChild(index: number) {
    onChange({ ...action, actions: children.filter((_, i) => i !== index) });
  }

  function addChild() {
    onChange({ ...action, actions: [...children, { type: "SHOW_ALERT" }] });
  }

  return (
    <div className="space-y-3 pl-4 border-l-2 border-border-base">
      <Field label="สุ่มเลือกกี่ action">
        <Input type="number" min={1} value={action.pick ?? 1} onChange={(event) => onChange({ ...action, pick: Number(event.target.value) })} />
      </Field>
      {children.map((child, index) => (
        <ActionEditor
          key={index}
          action={child}
          widgets={widgets}
          mediaAssets={mediaAssets}
          availableFields={availableFields}
          onChange={(next) => updateChild(index, next)}
          onRemove={() => removeChild(index)}
          isRandomChild
        />
      ))}
      <button type="button" onClick={addChild} className="text-xs font-semibold text-primary hover:opacity-80">
        + เพิ่ม action ในกลุ่มสุ่ม
      </button>
    </div>
  );
}

function RuleEditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ruleId = searchParams.get("id");
  const isNew = !ruleId;

  const [name, setName] = useState("Rule ใหม่");
  const [isEnabled, setIsEnabled] = useState(true);
  const [priority, setPriority] = useState(0);
  const [stopOnMatch, setStopOnMatch] = useState(false);
  const [eventTypes, setEventTypes] = useState<string[]>(["live.chat.message"]);
  const [conditions, setConditions] = useState<ConditionGroup>({ all: [] });
  const [actions, setActions] = useState<RuleAction[]>([]);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [cooldownScope, setCooldownScope] = useState<"rule" | "user">("rule");
  const [activeFrom, setActiveFrom] = useState("");
  const [activeTo, setActiveTo] = useState("");

  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [testEventType, setTestEventType] = useState("live.chat.message");
  const [testPayload, setTestPayload] = useState(JSON.stringify(SAMPLE_PAYLOADS["live.chat.message"], null, 2));
  const [testResult, setTestResult] = useState<{ eventTypeMatches: boolean; matched: boolean; trace: TraceEntry[] } | null>(null);
  const [testError, setTestError] = useState("");
  const [testing, setTesting] = useState(false);

  function buildPayload() {
    return {
      name: name.trim(),
      isEnabled,
      priority,
      stopOnMatch,
      eventTypes,
      conditions,
      actions,
      cooldownSeconds,
      cooldownScope,
      activeFrom: activeFrom || null,
      activeTo: activeTo || null
    };
  }

  const isDirty = !loading && JSON.stringify(buildPayload()) !== initialSnapshot;
  const { UnsavedChangesModal } = useUnsavedChangesWarning(isDirty);

  useEffect(() => {
    void Promise.all([api<Widget[]>("/widgets"), api<MediaAsset[]>("/media")])
      .then(([w, m]) => {
        setWidgets(w);
        setMediaAssets(m);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, []);

  useEffect(() => {
    if (isNew) {
      setInitialSnapshot(JSON.stringify(buildPayload()));
      return;
    }
    void api<RuleDetail>(`/rules/${ruleId}`)
      .then((rule) => {
        setName(rule.name);
        setIsEnabled(rule.isEnabled);
        setPriority(rule.priority);
        setStopOnMatch(rule.stopOnMatch);
        setEventTypes(rule.eventTypes);
        setConditions(rule.conditions ?? { all: [] });
        setActions(rule.actions ?? []);
        setCooldownSeconds(rule.cooldownSeconds);
        setCooldownScope(rule.cooldownScope === "user" ? "user" : "rule");
        setActiveFrom(rule.activeFrom ?? "");
        setActiveTo(rule.activeTo ?? "");
        setLoading(false);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Rule ไม่สำเร็จ"));
    // Note: loading intentionally stays true on failure so the blank-default form is never
    // rendered/submittable for an existing rule that failed to load (would risk overwriting
    // real data with defaults on save).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleId, isNew]);

  useEffect(() => {
    if (loading || isNew) return;
    setInitialSnapshot((prev) => prev || JSON.stringify(buildPayload()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const availableFields = useMemo(() => {
    const set = new Set<string>();
    for (const type of eventTypes) for (const field of FIELD_OPTIONS[type] ?? []) set.add(field);
    return [...set];
  }, [eventTypes]);

  function toggleEventType(type: string) {
    setEventTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  function addAction() {
    setActions((prev) => [...prev, { type: "SHOW_ALERT" }]);
  }

  function updateAction(index: number, next: RuleAction) {
    setActions((prev) => prev.map((a, i) => (i === index ? next : a)));
  }

  function removeAction(index: number) {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("กรุณาใส่ชื่อ Rule");
      return;
    }
    if (eventTypes.length === 0) {
      setError("เลือก trigger อย่างน้อย 1 อย่าง");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = buildPayload();
      if (isNew) {
        const created = await api<{ id: string }>("/rules", { method: "POST", body: JSON.stringify(payload) });
        setInitialSnapshot(JSON.stringify(payload));
        router.push(`/dashboard/rules/edit?id=${created.id}`);
      } else {
        await api(`/rules/${ruleId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setInitialSnapshot(JSON.stringify(payload));
        setMessage("บันทึก Rule แล้ว");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึก Rule ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    if (!ruleId) {
      setTestError("บันทึก Rule ก่อนถึงจะทดสอบได้");
      return;
    }
    setTesting(true);
    setTestError("");
    setTestResult(null);
    try {
      const payload = JSON.parse(testPayload);
      const result = await api<{ eventTypeMatches: boolean; matched: boolean; trace: TraceEntry[] }>(`/rules/${ruleId}/test`, {
        method: "POST",
        body: JSON.stringify({ eventType: testEventType, payload })
      });
      setTestResult(result);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "ทดสอบไม่สำเร็จ — ตรวจสอบ JSON payload");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell title="แก้ไข Rule">
        <div className="mb-5">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/rules">กลับไปหน้า Rules</Link>
          </Button>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : <p className="text-sm text-ink-subtle">กำลังโหลด...</p>}
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={isNew ? "สร้าง Rule" : "แก้ไข Rule"}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/rules">กลับไปหน้า Rules</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Badge tone={isEnabled ? "success" : "neutral"}>{isEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge>
          {!isNew ? <Badge tone="info">ลำดับความสำคัญ {priority}</Badge> : null}
        </div>
      </div>

      <div className="mb-4 space-y-3">
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>

      <div className="flex flex-col-reverse gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_420px]">
      <form className="space-y-6" onSubmit={submit}>
        <ResourceCard className="space-y-4">
          <h2 className="text-lg font-bold text-white">พื้นฐาน</h2>
          <Field label="ชื่อ Rule">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="ลำดับความสำคัญ" hint="เลขน้อย = ประเมินก่อน">
              <Input type="number" value={priority} onChange={(event) => setPriority(Number(event.target.value))} />
            </Field>
            <div className="pt-6">
              <ToggleField checked={isEnabled} disabled={false} label="เปิดใช้งาน" onChange={setIsEnabled} />
            </div>
            <div className="pt-6">
              <ToggleField checked={stopOnMatch} disabled={false} label="หยุดประเมิน rule อื่นถ้า match" onChange={setStopOnMatch} />
            </div>
          </div>
        </ResourceCard>

        <ResourceCard className="space-y-4">
          <h2 className="text-lg font-bold text-white">Trigger</h2>
          <div className="flex flex-wrap gap-3">
            {EVENT_TYPE_OPTIONS.map((option) => {
              const active = eventTypes.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleEventType(option.value)}
                  className={`border-2 px-3 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base ${
                    active
                      ? "border-primary bg-primary/10 text-primary shadow-brutal-sm"
                      : "border-border-base bg-surface-base text-ink-subtle hover:border-ink-faint hover:bg-surface-dark hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </ResourceCard>

        <ResourceCard className="space-y-4">
          <h2 className="text-lg font-bold text-white">เงื่อนไข</h2>
          <p className="text-xs text-ink-faint">ถ้าไม่เพิ่มเงื่อนไขเลย = ทำงานทุกครั้งที่มี trigger เกิดขึ้น</p>
          <ConditionGroupEditor node={conditions} fields={availableFields} onChange={setConditions} />
        </ResourceCard>

        <ResourceCard className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Actions</h2>
            <button type="button" onClick={addAction} className="text-xs font-semibold text-primary hover:opacity-80">
              + เพิ่ม Action
            </button>
          </div>
          {actions.length === 0 ? <p className="text-xs text-ink-faint">ยังไม่มี action — เพิ่มอย่างน้อย 1 อย่างเพื่อให้ rule นี้มีผล</p> : null}
          {actions.map((action, index) => (
            <ActionEditor
              key={index}
              action={action}
              widgets={widgets}
              mediaAssets={mediaAssets}
              availableFields={availableFields}
              onChange={(next) => updateAction(index, next)}
              onRemove={() => removeAction(index)}
              isRandomChild={false}
            />
          ))}
        </ResourceCard>

        <ResourceCard className="space-y-4">
          <h2 className="text-lg font-bold text-white">จังหวะเวลา</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cooldown (วินาที)">
              <Input type="number" min={0} value={cooldownSeconds} onChange={(event) => setCooldownSeconds(Number(event.target.value))} />
            </Field>
            <Field label="ขอบเขต Cooldown">
              <Select value={cooldownScope} onChange={(event) => setCooldownScope(event.target.value === "user" ? "user" : "rule")}>
                <option value="rule">ทั้ง Rule</option>
                <option value="user">แยกตามผู้ใช้</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="เริ่มทำงาน (HH:mm)" hint="เว้นว่าง = ทำงานตลอดเวลา">
              <Input placeholder="20:00" value={activeFrom} onChange={(event) => setActiveFrom(event.target.value)} />
            </Field>
            <Field label="สิ้นสุด (HH:mm)">
              <Input placeholder="23:59" value={activeTo} onChange={(event) => setActiveTo(event.target.value)} />
            </Field>
          </div>
        </ResourceCard>

        <div className="flex gap-3">
          <Button
            disabled={busy}
            type="submit"
            className={isDirty ? "bg-rose-600 text-white hover:bg-rose-500 border-rose-500 animate-pulse shadow-rose-900/20" : ""}
          >
            {busy ? "กำลังบันทึก..." : "บันทึก Rule"}
          </Button>
        </div>
      </form>

      <aside className="sticky top-28 z-20 self-start xl:top-32">
      <ResourceCard className="space-y-4">
        <h2 className="text-lg font-bold text-white">ทดสอบ Rule</h2>
        {isNew ? <p className="text-xs text-amber-400">บันทึก Rule ก่อนถึงจะทดสอบได้</p> : null}
        <Field label="Event type ตัวอย่าง">
          <Select
            value={testEventType}
            onChange={(event) => {
              setTestEventType(event.target.value);
              setTestPayload(JSON.stringify(SAMPLE_PAYLOADS[event.target.value] ?? {}, null, 2));
            }}
          >
            {EVENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Payload (JSON)">
          <Textarea rows={6} value={testPayload} onChange={(event) => setTestPayload(event.target.value)} />
        </Field>
        <Button type="button" disabled={testing || isNew} onClick={() => void runTest()} variant="secondary">
          {testing ? "กำลังทดสอบ..." : "รันทดสอบ"}
        </Button>
        {testError ? <Notice tone="error">{testError}</Notice> : null}
        {testResult ? (
          <div className="space-y-2">
            <Notice tone={testResult.matched ? "success" : "info"}>
              {testResult.matched
                ? "เงื่อนไขตรงกัน — หมายเหตุ: การทดสอบนี้ไม่ได้ตรวจสอบ cooldown หรือช่วงเวลาทำงาน (active time window) จึงอาจไม่ทำงานจริงหาก rule ติด cooldown หรืออยู่นอกช่วงเวลาที่กำหนด"
                : testResult.eventTypeMatches
                  ? "เงื่อนไขไม่ผ่าน"
                  : "event type ไม่ตรงกับ trigger ของ rule นี้"}
            </Notice>
            {testResult.trace.map((entry, index) => (
              <div
                key={index}
                className={`border-2 px-3 py-2 text-xs font-semibold ${entry.passed ? "border-emerald-500 text-emerald-400" : "border-rose-500 text-rose-400"}`}
              >
                {entry.field} {entry.operator} {JSON.stringify(entry.expected)} — ค่าจริง: {JSON.stringify(entry.actual)} — {entry.passed ? "ผ่าน" : "ไม่ผ่าน"}
              </div>
            ))}
          </div>
        ) : null}
      </ResourceCard>
      </aside>
      </div>

      {UnsavedChangesModal}
    </DashboardShell>
  );
}

export default function RuleEditPage() {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-ink-subtle">กำลังโหลด...</div>}>
      <RuleEditContent />
    </Suspense>
  );
}
