"use client";

import Link from "next/link";
import { ResourceCard } from "../resource-card";
import { configNumber } from "./config";
import { RangeField, SettingsHeader, SettingsSection } from "./fields";

export type TtsSettingsDraft = {
  volume: number;
};

export function ttsSettingsFromConfig(config: Record<string, unknown>): TtsSettingsDraft {
  return {
    volume: configNumber(config, "volume", 1)
  };
}

export function TtsWidgetSettings({ busy, draft, isDirty, onDraftChange, onSave }: {
  busy: boolean;
  draft: TtsSettingsDraft;
  isDirty: boolean;
  onDraftChange: (draft: TtsSettingsDraft) => void;
  onSave: () => Promise<void>;
}) {
  return (
    <ResourceCard>
      <SettingsHeader busy={busy} description="widget นี้อ่านข้อความเป็นเสียงอย่างเดียว ไม่แสดงภาพบนสตรีม" isDirty={isDirty} onSave={onSave} title="ปรับแต่ง TTS Widget" />

      <SettingsSection title="เสียง">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RangeField disabled={busy} label="ความดัง (Volume)" min={0} max={1} step={0.05} value={draft.volume} onChange={(value) => onDraftChange({ ...draft, volume: value })} />
          <p className="self-center text-xs text-ink-subtle">
            ตั้งค่าเสียงพูด (voice, ความเร็ว, ระดับเสียง) ได้ที่หน้า{" "}
            <Link className="text-primary underline" href="/dashboard/tts">ตั้งค่า TTS</Link>
          </p>
        </div>
      </SettingsSection>
    </ResourceCard>
  );
}
