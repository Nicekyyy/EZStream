"use client";

import { ResourceCard } from "../resource-card";
import { Field, Input, Select } from "../ui-kit";
import { configNumber, configString } from "./config";
import { RangeField, SettingsHeader, SettingsSection } from "./fields";

export type MediaAssetOption = { id: string; originalName: string; type: string; publicPath: string };

export type ImageSettingsDraft = {
  src: string;
  fit: string;
  opacity: number;
  borderRadius: number;
  showMode: string;
  defaultDurationMs: number;
};

export function imageSettingsFromConfig(config: Record<string, unknown>): ImageSettingsDraft {
  return {
    src: configString(config, "src", configString(config, "url", "")),
    fit: configString(config, "fit", "contain"),
    opacity: configNumber(config, "opacity", 1),
    borderRadius: configNumber(config, "borderRadius", 0),
    showMode: configString(config, "showMode", "always"),
    defaultDurationMs: configNumber(config, "defaultDurationMs", 5000)
  };
}

export function ImageWidgetSettings({ busy, draft, isDirty, mediaAssets, onDraftChange, onSave }: {
  busy: boolean;
  draft: ImageSettingsDraft;
  isDirty: boolean;
  mediaAssets: MediaAssetOption[];
  onDraftChange: (draft: ImageSettingsDraft) => void;
  onSave: () => Promise<void>;
}) {
  function setValue<K extends keyof ImageSettingsDraft>(key: K, value: ImageSettingsDraft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  const imageAssets = mediaAssets.filter((asset) => asset.type === "IMAGE");
  const selectedAsset = imageAssets.find((asset) => asset.publicPath === draft.src);

  return (
    <ResourceCard>
      <SettingsHeader busy={busy} description="เลือกรูปและการแสดงผล" isDirty={isDirty} onSave={onSave} title="ปรับแต่ง Image Widget" />

      <SettingsSection title="รูปภาพ">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="เลือกจากคลังสื่อ">
            <Select
              disabled={busy}
              value={selectedAsset?.id ?? ""}
              onChange={(event) => {
                const asset = imageAssets.find((item) => item.id === event.target.value);
                setValue("src", asset?.publicPath ?? "");
              }}
            >
              <option value="">— ไม่เลือก / ใช้ URL ด้านขวา —</option>
              {imageAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.originalName}</option>
              ))}
            </Select>
          </Field>
          <Field label="หรือใส่ URL รูปโดยตรง">
            <Input disabled={busy} placeholder="https://... หรือ /storage/..." value={draft.src} onChange={(event) => setValue("src", event.target.value)} />
          </Field>
          {imageAssets.length === 0 ? (
            <p className="sm:col-span-2 text-xs text-amber-400">ยังไม่มีรูปในคลังสื่อ — อัปโหลดได้ที่เมนู Media หรือใส่ URL โดยตรง</p>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection title="การแสดงผล">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="รูปแบบการวางรูป (Fit)">
            <Select disabled={busy} value={draft.fit} onChange={(event) => setValue("fit", event.target.value)}>
              <option value="contain">Contain (เห็นทั้งรูป)</option>
              <option value="cover">Cover (เต็มกรอบ)</option>
              <option value="fill">Fill (ยืดเต็มกรอบ)</option>
            </Select>
          </Field>
          <RangeField disabled={busy} label="ความทึบของรูป (Opacity)" min={0} max={1} step={0.05} value={draft.opacity} onChange={(value) => setValue("opacity", value)} />
          <RangeField disabled={busy} label="มุมโค้ง (Border Radius)" min={0} max={200} step={1} value={draft.borderRadius} onChange={(value) => setValue("borderRadius", value)} />
          <Field label="โหมดการแสดง">
            <Select disabled={busy} value={draft.showMode} onChange={(event) => setValue("showMode", event.target.value)}>
              <option value="always">แสดงตลอดเวลา</option>
              <option value="triggered">แสดงเฉพาะเมื่อถูก trigger</option>
            </Select>
          </Field>
          {draft.showMode === "triggered" ? (
            <RangeField disabled={busy} label="ระยะเวลาแสดงเมื่อ trigger (ms)" min={500} max={30000} step={500} value={draft.defaultDurationMs} onChange={(value) => setValue("defaultDurationMs", value)} />
          ) : null}
        </div>
      </SettingsSection>
    </ResourceCard>
  );
}
