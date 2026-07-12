"use client";

import { ResourceCard } from "../resource-card";
import { Field, Select, Textarea } from "../ui-kit";
import { configBool, configNumber, configString } from "./config";
import { ColorField, FontSettings, RangeField, SettingsHeader, SettingsSection, ToggleField } from "./fields";

export type AlertSettingsDraft = {
  template: string;
  defaultDurationMs: number;
  showLabel: boolean;
  accentColor: string;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  borderRadius: number;
  textShadow: boolean;
  animationType: string;
  exitAnimationType: string;
  animationDuration: number;
};

export function alertSettingsFromConfig(config: Record<string, unknown>): AlertSettingsDraft {
  return {
    template: configString(config, "template", ""),
    defaultDurationMs: configNumber(config, "defaultDurationMs", 0),
    showLabel: configBool(config, "showLabel", true),
    accentColor: configString(config, "accentColor", "#E5FC52"),
    textColor: configString(config, "textColor", "#ffffff"),
    backgroundColor: configString(config, "backgroundColor", "#000000"),
    backgroundOpacity: configNumber(config, "backgroundOpacity", 0.7),
    fontFamily: configString(config, "fontFamily", "system"),
    fontSize: configNumber(config, "fontSize", 30),
    fontWeight: configString(config, "fontWeight", "black"),
    borderRadius: configNumber(config, "borderRadius", 0),
    textShadow: configBool(config, "textShadow", false),
    animationType: configString(config, "animationType", "none"),
    exitAnimationType: configString(config, "exitAnimationType", "none"),
    animationDuration: configNumber(config, "animationDuration", 0.3)
  };
}

const ANIMATION_OPTIONS = [
  { value: "none", label: "ไม่มี" },
  { value: "fade", label: "ค่อยๆ ปรากฏ (Fade)" },
  { value: "slide-up", label: "เลื่อนขึ้น (Slide Up)" },
  { value: "pop", label: "Pop (เด้ง)" }
];

export function AlertWidgetSettings({ busy, draft, isDirty, onDraftChange, onSave }: {
  busy: boolean;
  draft: AlertSettingsDraft;
  isDirty: boolean;
  onDraftChange: (draft: AlertSettingsDraft) => void;
  onSave: () => Promise<void>;
}) {
  function setValue<K extends keyof AlertSettingsDraft>(key: K, value: AlertSettingsDraft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  return (
    <ResourceCard>
      <SettingsHeader busy={busy} description="ตั้งค่าข้อความ สี และอนิเมชันของ Alert" isDirty={isDirty} onSave={onSave} title="ปรับแต่ง Alert Widget" />

      <SettingsSection title="ข้อความและเวลา">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="ข้อความเริ่มต้น" hint="ใช้เมื่อ action ไม่ได้ส่งข้อความมา — ใช้ {field} เช่น {displayName} ได้">
              <Textarea disabled={busy} rows={2} value={draft.template} onChange={(event) => setValue("template", event.target.value)} />
            </Field>
          </div>
          <RangeField
            disabled={busy}
            label="ระยะเวลาแสดงเริ่มต้น (วินาที, 0 = แสดงตลอด)"
            min={0}
            max={30}
            step={0.5}
            value={draft.defaultDurationMs / 1000}
            onChange={(value) => setValue("defaultDurationMs", Math.round(value * 1000))}
          />
          <ToggleField disabled={busy} label="แสดงป้ายคำว่า Alert" checked={draft.showLabel} onChange={(value) => setValue("showLabel", value)} />
        </div>
      </SettingsSection>

      <SettingsSection title="สีและตัวอักษร">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ColorField disabled={busy} label="สีข้อความ" value={draft.textColor} onChange={(value) => setValue("textColor", value)} />
          <ColorField disabled={busy} label="สีแถบเน้น (ซ้าย)" value={draft.accentColor} onChange={(value) => setValue("accentColor", value)} />
          <ColorField disabled={busy} label="สีพื้นหลัง" value={draft.backgroundColor} onChange={(value) => setValue("backgroundColor", value)} />
          <RangeField disabled={busy} label="ความโปร่งใสพื้นหลัง" min={0} max={1} step={0.05} value={draft.backgroundOpacity} onChange={(value) => setValue("backgroundOpacity", value)} />
          <RangeField disabled={busy} label="มุมโค้ง (Border Radius)" min={0} max={48} step={1} value={draft.borderRadius} onChange={(value) => setValue("borderRadius", value)} />
          <RangeField disabled={busy} label="ขนาดตัวอักษร" min={10} max={96} step={1} value={draft.fontSize} onChange={(value) => setValue("fontSize", value)} />
          <FontSettings disabled={busy} family={draft.fontFamily} weight={draft.fontWeight} onFamilyChange={(value) => setValue("fontFamily", value)} onWeightChange={(value) => setValue("fontWeight", value)} />
          <ToggleField disabled={busy} label="เงาตัวอักษร" checked={draft.textShadow} onChange={(value) => setValue("textShadow", value)} />
        </div>
      </SettingsSection>

      <SettingsSection title="อนิเมชัน">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Animation ขาเข้า">
            <Select disabled={busy} value={draft.animationType} onChange={(event) => setValue("animationType", event.target.value)}>
              {ANIMATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Animation ขาออก">
            <Select disabled={busy} value={draft.exitAnimationType} onChange={(event) => setValue("exitAnimationType", event.target.value)}>
              {ANIMATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </Field>
          <RangeField disabled={busy} label="ความเร็วอนิเมชัน (วินาที)" min={0.1} max={2} step={0.1} value={draft.animationDuration} onChange={(value) => setValue("animationDuration", value)} />
        </div>
      </SettingsSection>
    </ResourceCard>
  );
}
