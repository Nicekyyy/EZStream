"use client";

import { ResourceCard } from "../resource-card";
import { Field, Select, Textarea } from "../ui-kit";
import { configBool, configNumber, configString } from "./config";
import { ColorField, FontSettings, RangeField, SettingsHeader, SettingsSection, ToggleField } from "./fields";

export type TextSettingsDraft = {
  text: string;
  align: string;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  padding: number;
  borderRadius: number;
  textShadow: boolean;
  textStrokeWidth: number;
  textStrokeColor: string;
};

export function textSettingsFromConfig(config: Record<string, unknown>): TextSettingsDraft {
  return {
    text: configString(config, "text", ""),
    align: configString(config, "align", "left"),
    textColor: configString(config, "textColor", "#ffffff"),
    backgroundColor: configString(config, "backgroundColor", "#000000"),
    backgroundOpacity: configNumber(config, "backgroundOpacity", 0.7),
    fontFamily: configString(config, "fontFamily", "system"),
    fontSize: configNumber(config, "fontSize", 28),
    fontWeight: configString(config, "fontWeight", "black"),
    padding: configNumber(config, "padding", 16),
    borderRadius: configNumber(config, "borderRadius", 0),
    textShadow: configBool(config, "textShadow", false),
    textStrokeWidth: configNumber(config, "textStrokeWidth", 0),
    textStrokeColor: configString(config, "textStrokeColor", "#000000")
  };
}

export function TextWidgetSettings({ busy, draft, isDirty, onDraftChange, onSave }: {
  busy: boolean;
  draft: TextSettingsDraft;
  isDirty: boolean;
  onDraftChange: (draft: TextSettingsDraft) => void;
  onSave: () => Promise<void>;
}) {
  function setValue<K extends keyof TextSettingsDraft>(key: K, value: TextSettingsDraft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  return (
    <ResourceCard>
      <SettingsHeader busy={busy} description="ตั้งค่าข้อความและรูปแบบตัวอักษร" isDirty={isDirty} onSave={onSave} title="ปรับแต่ง Text Widget" />

      <SettingsSection title="ข้อความ">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="ข้อความ" hint="อัปเดตแบบไดนามิกได้ผ่าน rule action UPDATE_TEXT">
              <Textarea disabled={busy} rows={2} value={draft.text} onChange={(event) => setValue("text", event.target.value)} />
            </Field>
          </div>
          <Field label="จัดแนว">
            <Select disabled={busy} value={draft.align} onChange={(event) => setValue("align", event.target.value)}>
              <option value="left">ชิดซ้าย</option>
              <option value="center">กึ่งกลาง</option>
              <option value="right">ชิดขวา</option>
            </Select>
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection title="สีและตัวอักษร">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ColorField disabled={busy} label="สีข้อความ" value={draft.textColor} onChange={(value) => setValue("textColor", value)} />
          <ColorField disabled={busy} label="สีพื้นหลัง" value={draft.backgroundColor} onChange={(value) => setValue("backgroundColor", value)} />
          <RangeField disabled={busy} label="ความโปร่งใสพื้นหลัง" min={0} max={1} step={0.05} value={draft.backgroundOpacity} onChange={(value) => setValue("backgroundOpacity", value)} />
          <RangeField disabled={busy} label="ขนาดตัวอักษร" min={8} max={120} step={1} value={draft.fontSize} onChange={(value) => setValue("fontSize", value)} />
          <FontSettings disabled={busy} family={draft.fontFamily} weight={draft.fontWeight} onFamilyChange={(value) => setValue("fontFamily", value)} onWeightChange={(value) => setValue("fontWeight", value)} />
          <RangeField disabled={busy} label="ระยะขอบใน (Padding)" min={0} max={80} step={1} value={draft.padding} onChange={(value) => setValue("padding", value)} />
          <RangeField disabled={busy} label="มุมโค้ง (Border Radius)" min={0} max={48} step={1} value={draft.borderRadius} onChange={(value) => setValue("borderRadius", value)} />
          <ToggleField disabled={busy} label="เงาตัวอักษร" checked={draft.textShadow} onChange={(value) => setValue("textShadow", value)} />
          <RangeField disabled={busy} label="ความหนาขอบอักษร" min={0} max={10} step={1} value={draft.textStrokeWidth} onChange={(value) => setValue("textStrokeWidth", value)} />
          {draft.textStrokeWidth > 0 ? (
            <ColorField disabled={busy} label="สีขอบอักษร" value={draft.textStrokeColor} onChange={(value) => setValue("textStrokeColor", value)} />
          ) : null}
        </div>
      </SettingsSection>
    </ResourceCard>
  );
}
