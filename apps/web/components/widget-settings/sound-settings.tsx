"use client";

import { useState } from "react";
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

export function SoundWidgetSettings({ busy, draft, isDirty, mediaAssets, onDraftChange, onSave, onUploadMedia }: {
  busy: boolean;
  draft: SoundSettingsDraft;
  isDirty: boolean;
  mediaAssets: MediaAssetOption[];
  onDraftChange: (draft: SoundSettingsDraft) => void;
  onSave: () => Promise<void>;
  onUploadMedia: (file: File) => Promise<MediaAssetOption>;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  function setValue<K extends keyof SoundSettingsDraft>(key: K, value: SoundSettingsDraft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setUploading(true);
      setUploadError("");
      const asset = await onUploadMedia(file);
      setValue("src", asset.publicPath);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "อัปโหลดเสียงไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
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
          <Field hint={uploadError ? undefined : "รองรับ MP3, WAV, OGG"} label="หรืออัปโหลดจากคอมพิวเตอร์">
            <input
              accept="audio/mpeg,audio/wav,audio/ogg"
              className="block w-full text-sm text-ink-subtle file:mr-4 file:cursor-pointer file:border-2 file:border-border-base file:bg-surface-dark file:px-4 file:py-2 file:text-sm file:font-bold file:text-white file:transition-colors hover:file:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy || uploading}
              onChange={handleUpload}
              type="file"
            />
            {uploadError ? <span className="mt-1.5 block text-xs leading-5 text-rose-400">{uploadError}</span> : null}
          </Field>
          <RangeField disabled={busy} label="ความดัง (Volume)" min={0} max={1} step={0.05} value={draft.volume} onChange={(value) => setValue("volume", value)} />
        </div>
      </SettingsSection>
    </ResourceCard>
  );
}
