"use client";

import { ResourceCard } from "../resource-card";
import { Field, Input } from "../ui-kit";
import { configBool, configNumber, configString } from "./config";
import { ColorField, FontSettings, RangeField, SettingsHeader, SettingsSection, ToggleField } from "./fields";

export type EventListSettingsDraft = {
  maxItems: number;
  showHeader: boolean;
  headerText: string;
  accentColor: string;
  itemBackgroundColor: string;
  itemBackgroundOpacity: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  borderRadius: number;
};

export function eventListSettingsFromConfig(config: Record<string, unknown>): EventListSettingsDraft {
  return {
    maxItems: configNumber(config, "maxItems", 8),
    showHeader: configBool(config, "showHeader", true),
    headerText: configString(config, "headerText", "กิจกรรมล่าสุด"),
    accentColor: configString(config, "accentColor", "#E5FC52"),
    itemBackgroundColor: configString(config, "itemBackgroundColor", "#0F0F13"),
    itemBackgroundOpacity: configNumber(config, "itemBackgroundOpacity", 0.4),
    textColor: configString(config, "textColor", "#ffffff"),
    backgroundColor: configString(config, "backgroundColor", "#000000"),
    backgroundOpacity: configNumber(config, "backgroundOpacity", 0.7),
    fontFamily: configString(config, "fontFamily", "system"),
    fontSize: configNumber(config, "fontSize", 12),
    fontWeight: configString(config, "fontWeight", "bold"),
    borderRadius: configNumber(config, "borderRadius", 0)
  };
}

export function EventListWidgetSettings({ busy, draft, isDirty, onDraftChange, onSave }: {
  busy: boolean;
  draft: EventListSettingsDraft;
  isDirty: boolean;
  onDraftChange: (draft: EventListSettingsDraft) => void;
  onSave: () => Promise<void>;
}) {
  function setValue<K extends keyof EventListSettingsDraft>(key: K, value: EventListSettingsDraft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  return (
    <ResourceCard>
      <SettingsHeader busy={busy} description="ตั้งค่ารายการ event ล่าสุดบน overlay" isDirty={isDirty} onSave={onSave} title="ปรับแต่ง Event List Widget" />

      <SettingsSection title="รายการ">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RangeField disabled={busy} label="จำนวนรายการสูงสุด" min={1} max={20} step={1} value={draft.maxItems} onChange={(value) => setValue("maxItems", value)} />
          <ToggleField disabled={busy} label="แสดงหัวข้อ" checked={draft.showHeader} onChange={(value) => setValue("showHeader", value)} />
          {draft.showHeader ? (
            <Field label="ข้อความหัวข้อ">
              <Input disabled={busy} value={draft.headerText} onChange={(event) => setValue("headerText", event.target.value)} />
            </Field>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection title="สีและตัวอักษร">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ColorField disabled={busy} label="สีข้อความ" value={draft.textColor} onChange={(value) => setValue("textColor", value)} />
          <ColorField disabled={busy} label="สีแถบเน้นรายการ" value={draft.accentColor} onChange={(value) => setValue("accentColor", value)} />
          <ColorField disabled={busy} label="สีพื้นรายการ" value={draft.itemBackgroundColor} onChange={(value) => setValue("itemBackgroundColor", value)} />
          <RangeField disabled={busy} label="ความโปร่งใสพื้นรายการ" min={0} max={1} step={0.05} value={draft.itemBackgroundOpacity} onChange={(value) => setValue("itemBackgroundOpacity", value)} />
          <ColorField disabled={busy} label="สีพื้นหลังรวม" value={draft.backgroundColor} onChange={(value) => setValue("backgroundColor", value)} />
          <RangeField disabled={busy} label="ความโปร่งใสพื้นหลังรวม" min={0} max={1} step={0.05} value={draft.backgroundOpacity} onChange={(value) => setValue("backgroundOpacity", value)} />
          <RangeField disabled={busy} label="มุมโค้งรายการ" min={0} max={32} step={1} value={draft.borderRadius} onChange={(value) => setValue("borderRadius", value)} />
          <RangeField disabled={busy} label="ขนาดตัวอักษร" min={8} max={32} step={1} value={draft.fontSize} onChange={(value) => setValue("fontSize", value)} />
          <FontSettings disabled={busy} family={draft.fontFamily} weight={draft.fontWeight} onFamilyChange={(value) => setValue("fontFamily", value)} onWeightChange={(value) => setValue("fontWeight", value)} />
        </div>
      </SettingsSection>
    </ResourceCard>
  );
}
