"use client";

import { ResourceCard } from "../resource-card";
import { Field, Input, Select } from "../ui-kit";
import { configNumber, configString } from "./config";
import { RangeField, SettingsHeader, SettingsSection } from "./fields";
import type { MediaAssetOption } from "./image-settings";

export type SoundSettingsDraft = {
  src: string;
  volume: number;
};

export function soundSettingsFromConfig(config: Record<string, unknown>): SoundSettingsDraft {
  return {
    src: configString(config, "src", configString(config, "url", "")),
    volume: configNumber(config, "volume", 1)
  };
}

export function SoundWidgetSettings({ busy, draft, isDirty, mediaAssets, onDraftChange, onSave }: {
  busy: boolean;
  draft: SoundSettingsDraft;
  isDirty: boolean;
  mediaAssets: MediaAssetOption[];
  onDraftChange: (draft: SoundSettingsDraft) => void;
  onSave: () => Promise<void>;
}) {
  function setValue<K extends keyof SoundSettingsDraft>(key: K, value: SoundSettingsDraft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  const audioAssets = mediaAssets.filter((asset) => asset.type === "AUDIO");
  const selectedAsset = audioAssets.find((asset) => asset.publicPath === draft.src);

  return (
    <ResourceCard>
      <SettingsHeader busy={busy} description="widget นี้เล่นเสียงอย่างเดียว ไม่แสดงภาพบนสตรีม" isDirty={isDirty} onSave={onSave} title="ปรับแต่ง Sound Widget" />

      <SettingsSection title="เสียง">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="เสียงเริ่มต้นจากคลังสื่อ" hint="ใช้เมื่อ action ไม่ได้เลือกไฟล์เสียง">
            <Select
              disabled={busy}
              value={selectedAsset?.id ?? ""}
              onChange={(event) => {
                const asset = audioAssets.find((item) => item.id === event.target.value);
                setValue("src", asset?.publicPath ?? "");
              }}
            >
              <option value="">— ไม่เลือก —</option>
              {audioAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.originalName}</option>
              ))}
            </Select>
          </Field>
          <Field label="หรือใส่ URL เสียงโดยตรง">
            <Input disabled={busy} placeholder="https://... หรือ /storage/..." value={draft.src} onChange={(event) => setValue("src", event.target.value)} />
          </Field>
          <RangeField disabled={busy} label="ความดัง (Volume)" min={0} max={1} step={0.05} value={draft.volume} onChange={(value) => setValue("volume", value)} />
        </div>
      </SettingsSection>
    </ResourceCard>
  );
}
