"use client";

import { Button } from "@ezstream/ui";
import { ResourceCard } from "../resource-card";
import { Field } from "../ui-kit";
import { useUnsavedChangesWarning } from "../../lib/use-unsaved-changes-warning";
import { configBool, configNumber, configString } from "./config";
import { ColorField, FontSettings, RangeField, SettingsSection, ToggleField } from "./fields";

export function viewerCountSettingsFromConfig(config: Record<string, unknown>) {
  const platforms = configString(config, "platforms", "all");
  return {
    showYoutube: configBool(config, "showYoutube", platforms === "all" || platforms === "youtube"),
    showTiktok: configBool(config, "showTiktok", platforms === "all" || platforms === "tiktok"),
    showTwitch: configBool(config, "showTwitch", platforms === "all" || platforms === "twitch"),
    showBackground: configBool(config, "showBackground", true),
    fontSize: configNumber(config, "fontSize", 16),
    iconSize: configNumber(config, "iconSize", 20),
    fontFamily: configString(config, "fontFamily", "Inter"),
    fontWeight: configString(config, "fontWeight", "700"),
    textColor: configString(config, "textColor", "#ffffff"),
    useSeparateColors: configBool(config, "useSeparateColors", false),
    youtubeColor: configString(config, "youtubeColor", "#ef4444"),
    tiktokColor: configString(config, "tiktokColor", "#22d3ee"),
    twitchColor: configString(config, "twitchColor", "#c084fc"),
    textShadow: configBool(config, "textShadow", true),
    backgroundColor: configString(config, "backgroundColor", "#000000"),
    backgroundOpacity: configNumber(config, "backgroundOpacity", 0.7),
    borderRadius: configNumber(config, "borderRadius", 8),
    gap: configNumber(config, "gap", 12),
    paddingX: configNumber(config, "paddingX", 16),
    paddingY: configNumber(config, "paddingY", 8),
    showPingDot: configBool(config, "showPingDot", true),
  };
}

export function ViewerCountWidgetSettings({
  busy,
  draft,
  isDirty,
  onDraftChange,
  onSave
}: {
  busy: boolean;
  draft: Record<string, any>;
  isDirty: boolean;
  onDraftChange: (draft: Record<string, any>) => void;
  onSave: () => Promise<void>;
}) {
  function setValue(key: string, value: any) {
    onDraftChange({ ...draft, [key]: value });
  }

  const handleSaveAndLeave = async () => {
    try {
      await onSave();
      return true;
    } catch {
      return false;
    }
  };

  const { UnsavedChangesModal } = useUnsavedChangesWarning(isDirty, handleSaveAndLeave);

  return (
    <ResourceCard>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-semibold text-white">ปรับแต่ง Viewer Count Widget</p>
          <p className="mt-1 text-xs font-medium text-ink-subtle">ตั้งค่าป้ายกำกับและการแสดงผลของจำนวนคนดู</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            disabled={busy} 
            onClick={() => void onSave()} 
            type="button"
            className={isDirty ? "bg-rose-600 text-white hover:bg-rose-500 border-rose-500 animate-pulse shadow-rose-900/20" : ""}
          >
            บันทึก
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <SettingsSection title="ทั่วไป">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="ช่องทางผู้ชมที่ต้องการแสดง">
              <div className="flex flex-col gap-2 mt-1">
                <ToggleField disabled={busy} label="YouTube" checked={draft.showYoutube} onChange={(value) => setValue("showYoutube", value)} />
                <ToggleField disabled={busy} label="TikTok" checked={draft.showTiktok} onChange={(value) => setValue("showTiktok", value)} />
                <ToggleField disabled={busy} label="Twitch" checked={draft.showTwitch} onChange={(value) => setValue("showTwitch", value)} />
              </div>
            </Field>
            <ToggleField disabled={busy} label="แสดงจุดไฟกระพริบ (Ping Dot)" checked={draft.showPingDot} onChange={(value) => setValue("showPingDot", value)} />
            <ToggleField disabled={busy} label="แสดงเงาข้อความ (Text Shadow)" checked={draft.textShadow} onChange={(value) => setValue("textShadow", value)} />
          </div>
        </SettingsSection>
        
        <SettingsSection title="ขนาดและตัวอักษร">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RangeField disabled={busy} label="ขนาดตัวอักษร" min={12} max={72} step={1} value={draft.fontSize} onChange={(value) => setValue("fontSize", value)} />
            <RangeField disabled={busy} label="ขนาดไอคอน" min={12} max={72} step={1} value={draft.iconSize} onChange={(value) => setValue("iconSize", value)} />
            <div className="col-span-full sm:col-span-2 lg:col-span-3">
              <FontSettings 
                disabled={busy} 
                family={draft.fontFamily} 
                weight={draft.fontWeight} 
                onFamilyChange={(f) => setValue("fontFamily", f)} 
                onWeightChange={(w) => setValue("fontWeight", w)} 
              />
            </div>
          </div>
        </SettingsSection>
        
        <SettingsSection title="รูปแบบและสีสัน">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ToggleField disabled={busy} label="แยกสีตัวเลขตามแพลตฟอร์ม" checked={draft.useSeparateColors} onChange={(value) => setValue("useSeparateColors", value)} />
            {!draft.useSeparateColors ? (
              <ColorField disabled={busy} label="สีตัวเลข (รวม)" value={draft.textColor} onChange={(value) => setValue("textColor", value)} />
            ) : (
              <>
                <ColorField disabled={busy} label="สีตัวเลข YouTube" value={draft.youtubeColor} onChange={(value) => setValue("youtubeColor", value)} />
                <ColorField disabled={busy} label="สีตัวเลข TikTok" value={draft.tiktokColor} onChange={(value) => setValue("tiktokColor", value)} />
                <ColorField disabled={busy} label="สีตัวเลข Twitch" value={draft.twitchColor} onChange={(value) => setValue("twitchColor", value)} />
              </>
            )}
            <ToggleField disabled={busy} label="แสดงพื้นหลัง" checked={draft.showBackground} onChange={(value) => setValue("showBackground", value)} />
            
            {draft.showBackground && (
              <>
                <ColorField disabled={busy} label="สีพื้นหลัง" value={draft.backgroundColor} onChange={(value) => setValue("backgroundColor", value)} />
                <RangeField disabled={busy} label="ความโปร่งใสพื้นหลัง" min={0} max={1} step={0.05} value={draft.backgroundOpacity} onChange={(value) => setValue("backgroundOpacity", value)} />
                <RangeField disabled={busy} label="ความโค้งมุม (Border Radius)" min={0} max={40} step={1} value={draft.borderRadius} onChange={(value) => setValue("borderRadius", value)} />
              </>
            )}
          </div>
        </SettingsSection>
        
        <SettingsSection title="การจัดวาง">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RangeField disabled={busy} label="ระยะห่างระหว่างรายการ (Gap)" min={0} max={40} step={1} value={draft.gap} onChange={(value) => setValue("gap", value)} />
            {draft.showBackground && (
              <>
                <RangeField disabled={busy} label="ระยะห่างขอบแนวนอน (Padding X)" min={0} max={40} step={1} value={draft.paddingX} onChange={(value) => setValue("paddingX", value)} />
                <RangeField disabled={busy} label="ระยะห่างขอบแนวตั้ง (Padding Y)" min={0} max={40} step={1} value={draft.paddingY} onChange={(value) => setValue("paddingY", value)} />
              </>
            )}
          </div>
        </SettingsSection>
      </div>
      {UnsavedChangesModal}
    </ResourceCard>
  );
}
