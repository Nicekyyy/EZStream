"use client";

import { ResourceCard } from "../resource-card";
import { Field, Input } from "../ui-kit";
import { configBool, configNumber, configString } from "./config";
import { ColorField, FontSettings, NumberField, RangeField, SettingsHeader, SettingsSection, ToggleField } from "./fields";

export type GoalSettingsDraft = {
  label: string;
  target: number;
  showValues: boolean;
  showPercent: boolean;
  barColor: string;
  barBackgroundColor: string;
  barBackgroundOpacity: number;
  barHeight: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  borderRadius: number;
};

export function goalSettingsFromConfig(config: Record<string, unknown>): GoalSettingsDraft {
  return {
    label: configString(config, "label", "Goal"),
    target: configNumber(config, "target", 100),
    showValues: configBool(config, "showValues", true),
    showPercent: configBool(config, "showPercent", false),
    barColor: configString(config, "barColor", "#E5FC52"),
    barBackgroundColor: configString(config, "barBackgroundColor", "#0F0F13"),
    barBackgroundOpacity: configNumber(config, "barBackgroundOpacity", 0.5),
    barHeight: configNumber(config, "barHeight", 24),
    textColor: configString(config, "textColor", "#ffffff"),
    backgroundColor: configString(config, "backgroundColor", "#000000"),
    backgroundOpacity: configNumber(config, "backgroundOpacity", 0.7),
    fontFamily: configString(config, "fontFamily", "system"),
    fontSize: configNumber(config, "fontSize", 12),
    fontWeight: configString(config, "fontWeight", "600"),
    borderRadius: configNumber(config, "borderRadius", 0)
  };
}

export function GoalWidgetSettings({ busy, draft, isDirty, onDraftChange, onSave }: {
  busy: boolean;
  draft: GoalSettingsDraft;
  isDirty: boolean;
  onDraftChange: (draft: GoalSettingsDraft) => void;
  onSave: () => Promise<void>;
}) {
  function setValue<K extends keyof GoalSettingsDraft>(key: K, value: GoalSettingsDraft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  return (
    <ResourceCard>
      <SettingsHeader busy={busy} description="ตั้งค่าเป้าหมายและหน้าตาของแถบ progress" isDirty={isDirty} onSave={onSave} title="ปรับแต่ง Goal Widget" />

      <SettingsSection title="เป้าหมาย">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="ชื่อเป้าหมาย">
            <Input disabled={busy} value={draft.label} onChange={(event) => setValue("label", event.target.value)} />
          </Field>
          <NumberField disabled={busy} label="ค่าเป้าหมาย" min={1} onChange={(value) => setValue("target", Math.max(1, Number(value) || 1))} value={draft.target} />
          <ToggleField disabled={busy} label="แสดงตัวเลข (เช่น 20/100)" checked={draft.showValues} onChange={(value) => setValue("showValues", value)} />
          {draft.showValues ? (
            <ToggleField disabled={busy} label="แสดงเปอร์เซ็นต์" checked={draft.showPercent} onChange={(value) => setValue("showPercent", value)} />
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection title="แถบ Progress">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ColorField disabled={busy} label="สีแถบ" value={draft.barColor} onChange={(value) => setValue("barColor", value)} />
          <ColorField disabled={busy} label="สีพื้นแถบ" value={draft.barBackgroundColor} onChange={(value) => setValue("barBackgroundColor", value)} />
          <RangeField disabled={busy} label="ความโปร่งใสพื้นแถบ" min={0} max={1} step={0.05} value={draft.barBackgroundOpacity} onChange={(value) => setValue("barBackgroundOpacity", value)} />
          <RangeField disabled={busy} label="ความสูงแถบ" min={4} max={80} step={1} value={draft.barHeight} onChange={(value) => setValue("barHeight", value)} />
        </div>
      </SettingsSection>

      <SettingsSection title="สีและตัวอักษร">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ColorField disabled={busy} label="สีข้อความ" value={draft.textColor} onChange={(value) => setValue("textColor", value)} />
          <ColorField disabled={busy} label="สีพื้นหลัง" value={draft.backgroundColor} onChange={(value) => setValue("backgroundColor", value)} />
          <RangeField disabled={busy} label="ความโปร่งใสพื้นหลัง" min={0} max={1} step={0.05} value={draft.backgroundOpacity} onChange={(value) => setValue("backgroundOpacity", value)} />
          <RangeField disabled={busy} label="มุมโค้ง (Border Radius)" min={0} max={48} step={1} value={draft.borderRadius} onChange={(value) => setValue("borderRadius", value)} />
          <RangeField disabled={busy} label="ขนาดตัวอักษร" min={8} max={48} step={1} value={draft.fontSize} onChange={(value) => setValue("fontSize", value)} />
          <FontSettings disabled={busy} family={draft.fontFamily} weight={draft.fontWeight} onFamilyChange={(value) => setValue("fontFamily", value)} onWeightChange={(value) => setValue("fontWeight", value)} />
        </div>
      </SettingsSection>
    </ResourceCard>
  );
}
