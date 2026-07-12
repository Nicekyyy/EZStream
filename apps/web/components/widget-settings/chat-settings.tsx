"use client";

import { Button } from "@ezstream/ui";
import { useState } from "react";
import { ResourceCard } from "../resource-card";
import { Field, Select } from "../ui-kit";
import { configBool, configNumber, configString } from "./config";
import { ColorField, FontSettings, NumberField, RangeField, SettingsSection, TabButton, ToggleField } from "./fields";

export type ChatSettingsDraft = {
  maxMessages: number;
  order: string;
  align: string;
  bubbleStyle: string;
  fontFamily: string;
  showAvatar: boolean;
  showName: boolean;
  showPlatformLogo: boolean;
  showBadges: boolean;
  badgesPosition: string;
  showEmptyState: boolean;
  animateMessages: boolean;
  compactMode: boolean;
  inlineMessage: boolean;
  nameMessageSpacing: number;
  verticalAlign: string;
  textShadow: boolean;
  backgroundColor: string;
  bubbleColor: string;
  textColor: string;
  tiktokNameColor: string;
  youtubeNameColor: string;
  twitchNameColor: string;
  backgroundOpacity: number;
  bubbleOpacity: number;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  borderOpacity: number;
  separateBubbles: boolean;
  nameBubbleColor: string;
  nameBubbleOpacity: number;
  nameBorderWidth: number;
  nameBorderRadius: number;
  nameBorderColor: string;
  nameBorderOpacity: number;
  nameBubbleDropShadow: boolean;
  nameBubbleShadowColor: string;
  nameBubbleShadowOpacity: number;
  nameBubbleShadowX: number;
  nameBubbleShadowY: number;
  nameBubbleShadowBlur: number;
  nameBubbleGradient: boolean;
  nameBubbleGradientColor: string;
  nameBubbleGradientAngle: number;
  fontSize: number;
  nameFontSize: number;
  avatarSize: number;
  padding: number;
  gap: number;
  messagePaddingX: number;
  messagePaddingY: number;
  fontWeight: string;
  avatarShape: string;
  animationType: string;
  textStrokeWidth: number;
  textStrokeColor: string;
  nameTextStrokeWidth: number;
  nameTextStrokeColor: string;
  nameFontWeight: string;
  nameFontFamily: string;
  hideAfter: number;
  exitAnimationType: string;
  textShadowColor: string;
  textShadowOpacity: number;
  textShadowX: number;
  textShadowY: number;
  textShadowBlur: number;
  nameTextShadow: boolean;
  nameTextShadowColor: string;
  nameTextShadowOpacity: number;
  nameTextShadowX: number;
  nameTextShadowY: number;
  nameTextShadowBlur: number;
  bubbleDropShadow: boolean;
  bubbleShadowColor: string;
  bubbleShadowOpacity: number;
  bubbleShadowX: number;
  bubbleShadowY: number;
  bubbleShadowBlur: number;
  animationDuration: number;
  backgroundGradient: boolean;
  backgroundGradientColor: string;
  backgroundGradientAngle: number;
  bubbleGradient: boolean;
  bubbleGradientColor: string;
  bubbleGradientAngle: number;
  useOwnerTextColor: boolean;
  ownerTextColor: string;
  useModTextColor: boolean;
  modTextColor: string;
  useMemberTextColor: boolean;
  memberTextColor: string;
  useOwnerNameColor: boolean;
  ownerNameColor: string;
  useModNameColor: boolean;
  modNameColor: string;
  useMemberNameColor: boolean;
  memberNameColor: string;
  randomNameColor: boolean;
  maxNameLength: number;
  avatarBorderWidth: number;
  avatarBorderColor: string;
  avatarBorderOpacity: number;
  platformLogoSize: number;
  platformLogoBorderWidth: number;
  platformLogoBorderColor: string;
  platformLogoBorderOpacity: number;
  badgeSize: number;
  badgeBorderWidth: number;
  badgeBorderColor: string;
  badgeBorderOpacity: number;
};

export function chatSettingsFromConfig(config: Record<string, unknown>): ChatSettingsDraft {
  return {
    maxMessages: configNumber(config, "maxMessages", 8),
    order: configString(config, "order", "newest-bottom"),
    align: configString(config, "align", "left"),
    verticalAlign: configString(config, "verticalAlign", "bottom"),
    bubbleStyle: "solid",
    fontFamily: configString(config, "fontFamily", "system"),
    fontWeight: configString(config, "fontWeight", "normal"),
    nameFontFamily: configString(config, "nameFontFamily", ""),
    nameFontWeight: configString(config, "nameFontWeight", "bold"),
    showAvatar: configBool(config, "showAvatar", true),
    showName: configBool(config, "showName", true),
    showPlatformLogo: configBool(config, "showPlatformLogo", true),
    showBadges: configBool(config, "showBadges", true),
    badgesPosition: configString(config, "badgesPosition", "after_name"),
    showEmptyState: configBool(config, "showEmptyState", true),
    animateMessages: configBool(config, "animateMessages", true),
    compactMode: configBool(config, "compactMode", false),
    inlineMessage: configBool(config, "inlineMessage", false),
    nameMessageSpacing: configNumber(config, "nameMessageSpacing", 4),
    textShadow: configBool(config, "textShadow", true),
    backgroundColor: configString(config, "backgroundColor", "#000000"),
    bubbleColor: configString(config, "bubbleColor", "#000000"),
    textColor: configString(config, "textColor", "#ffffff"),
    tiktokNameColor: configString(config, "tiktokNameColor", "#f9a8d4"),
    youtubeNameColor: configString(config, "youtubeNameColor", "#fca5a5"),
    twitchNameColor: configString(config, "twitchNameColor", "#c4b5fd"),
    backgroundOpacity: configNumber(config, "backgroundOpacity", 0),
    bubbleOpacity: configNumber(config, "bubbleOpacity", 0.55),
    borderOpacity: configNumber(config, "borderOpacity", 0.1),
    borderWidth: configNumber(config, "borderWidth", 1),
    borderColor: configString(config, "borderColor", "#ffffff"),
    separateBubbles: configBool(config, "separateBubbles", false),
    nameBubbleColor: configString(config, "nameBubbleColor", "#000000"),
    nameBubbleOpacity: configNumber(config, "nameBubbleOpacity", 0.55),
    nameBorderWidth: configNumber(config, "nameBorderWidth", 1),
    nameBorderRadius: configNumber(config, "nameBorderRadius", 6),
    nameBorderColor: configString(config, "nameBorderColor", "#ffffff"),
    nameBorderOpacity: configNumber(config, "nameBorderOpacity", 0.1),
    nameBubbleDropShadow: configBool(config, "nameBubbleDropShadow", false),
    nameBubbleShadowColor: configString(config, "nameBubbleShadowColor", "#000000"),
    nameBubbleShadowOpacity: configNumber(config, "nameBubbleShadowOpacity", 0.5),
    nameBubbleShadowX: configNumber(config, "nameBubbleShadowX", 0),
    nameBubbleShadowY: configNumber(config, "nameBubbleShadowY", 4),
    nameBubbleShadowBlur: configNumber(config, "nameBubbleShadowBlur", 8),
    nameBubbleGradient: configBool(config, "nameBubbleGradient", false),
    nameBubbleGradientColor: configString(config, "nameBubbleGradientColor", "#000000"),
    nameBubbleGradientAngle: configNumber(config, "nameBubbleGradientAngle", 180),
    fontSize: configNumber(config, "fontSize", 15),
    nameFontSize: configNumber(config, "nameFontSize", 13),
    avatarSize: configNumber(config, "avatarSize", 32),
    avatarBorderWidth: configNumber(config, "avatarBorderWidth", 2),
    avatarBorderColor: configString(config, "avatarBorderColor", "#ffffff"),
    avatarBorderOpacity: configNumber(config, "avatarBorderOpacity", 0.15),
    platformLogoSize: configNumber(config, "platformLogoSize", 16),
    platformLogoBorderWidth: configNumber(config, "platformLogoBorderWidth", 0),
    platformLogoBorderColor: configString(config, "platformLogoBorderColor", "#ffffff"),
    platformLogoBorderOpacity: configNumber(config, "platformLogoBorderOpacity", 0.15),
    badgeSize: configNumber(config, "badgeSize", 16),
    badgeBorderWidth: configNumber(config, "badgeBorderWidth", 0),
    badgeBorderColor: configString(config, "badgeBorderColor", "#ffffff"),
    badgeBorderOpacity: configNumber(config, "badgeBorderOpacity", 0.15),
    maxNameLength: configNumber(config, "maxNameLength", 0),
    padding: configNumber(config, "padding", 12),
    gap: configNumber(config, "gap", 8),
    borderRadius: configNumber(config, "borderRadius", 6),
    messagePaddingX: configNumber(config, "messagePaddingX", 12),
    messagePaddingY: configNumber(config, "messagePaddingY", 8),
    avatarShape: configString(config, "avatarShape", "circle"),
    animationType: configString(config, "animationType", configBool(config, "animateMessages", true) ? "fade" : "none"),
    exitAnimationType: configString(config, "exitAnimationType", configBool(config, "animateMessages", true) ? "fade" : "none"),
    animationDuration: configNumber(config, "animationDuration", 0.3),
    hideAfter: configNumber(config, "hideAfter", 0),
    textStrokeWidth: configNumber(config, "textStrokeWidth", 0),
    textStrokeColor: configString(config, "textStrokeColor", "#000000"),
    nameTextStrokeWidth: configNumber(config, "nameTextStrokeWidth", configNumber(config, "textStrokeWidth", 0)),
    nameTextStrokeColor: configString(config, "nameTextStrokeColor", configString(config, "textStrokeColor", "#000000")),
    textShadowColor: configString(config, "textShadowColor", "#000000"),
    textShadowOpacity: configNumber(config, "textShadowOpacity", 0.55),
    textShadowX: configNumber(config, "textShadowX", 0),
    textShadowY: configNumber(config, "textShadowY", 1),
    textShadowBlur: configNumber(config, "textShadowBlur", 1),
    nameTextShadow: configBool(config, "nameTextShadow", configBool(config, "textShadow", true)),
    nameTextShadowColor: configString(config, "nameTextShadowColor", configString(config, "textShadowColor", "#000000")),
    nameTextShadowOpacity: configNumber(config, "nameTextShadowOpacity", configNumber(config, "textShadowOpacity", 0.55)),
    nameTextShadowX: configNumber(config, "nameTextShadowX", configNumber(config, "textShadowX", 0)),
    nameTextShadowY: configNumber(config, "nameTextShadowY", configNumber(config, "textShadowY", 1)),
    nameTextShadowBlur: configNumber(config, "nameTextShadowBlur", configNumber(config, "textShadowBlur", 1)),
    bubbleDropShadow: configBool(config, "bubbleDropShadow", false),
    bubbleShadowColor: configString(config, "bubbleShadowColor", "#000000"),
    bubbleShadowOpacity: configNumber(config, "bubbleShadowOpacity", 0.5),
    bubbleShadowX: configNumber(config, "bubbleShadowX", 0),
    bubbleShadowY: configNumber(config, "bubbleShadowY", 4),
    bubbleShadowBlur: configNumber(config, "bubbleShadowBlur", 8),
    backgroundGradient: configBool(config, "backgroundGradient", false),
    backgroundGradientColor: configString(config, "backgroundGradientColor", "#000000"),
    backgroundGradientAngle: configNumber(config, "backgroundGradientAngle", 180),
    bubbleGradient: configBool(config, "bubbleGradient", false),
    bubbleGradientColor: configString(config, "bubbleGradientColor", "#000000"),
    bubbleGradientAngle: configNumber(config, "bubbleGradientAngle", 180),
    useOwnerTextColor: configBool(config, "useOwnerTextColor", false),
    ownerTextColor: configString(config, "ownerTextColor", "#fbbf24"),
    useModTextColor: configBool(config, "useModTextColor", false),
    modTextColor: configString(config, "modTextColor", "#34d399"),
    useMemberTextColor: configBool(config, "useMemberTextColor", false),
    memberTextColor: configString(config, "memberTextColor", "#a78bfa"),
    useOwnerNameColor: configBool(config, "useOwnerNameColor", false),
    ownerNameColor: configString(config, "ownerNameColor", "#fbbf24"),
    useModNameColor: configBool(config, "useModNameColor", false),
    modNameColor: configString(config, "modNameColor", "#34d399"),
    useMemberNameColor: configBool(config, "useMemberNameColor", false),
    memberNameColor: configString(config, "memberNameColor", "#a78bfa"),
    randomNameColor: configBool(config, "randomNameColor", false),
  };
}

export function ChatWidgetSettings({
  busy,
  draft,
  isDirty,
  onDraftChange,
  onReset,
  onSave
}: {
  busy: boolean;
  draft: ChatSettingsDraft;
  isDirty?: boolean;
  onDraftChange: (draft: ChatSettingsDraft) => void;
  onReset: () => void;
  onSave: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"general" | "typography" | "bubble" | "namebadge" | "textcolors" | "icons" | "animations">("general");

  function setValue<K extends keyof ChatSettingsDraft>(key: K, value: ChatSettingsDraft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  return (
    <ResourceCard>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-semibold text-white">ปรับแต่ง Chat Widget</p>
          <p className="mt-1 text-xs font-medium text-ink-subtle">เลือกหมวดหมู่ที่ต้องการตั้งค่าด้านล่าง</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            disabled={busy} 
            onClick={() => void onSave()} 
            type="button"
            className={isDirty ? "bg-rose-600 text-white hover:bg-rose-500 border-rose-500 animate-pulse shadow-rose-900/20" : ""}
          >
            บันทึก Chat
          </Button>
          <Button disabled={busy} onClick={onReset} type="button" variant="secondary">รีเซ็ต</Button>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-3 border-b-2 border-border-base pb-6">
        <TabButton active={activeTab === "general"} onClick={() => setActiveTab("general")}>ทั่วไป</TabButton>
        <TabButton active={activeTab === "typography"} onClick={() => setActiveTab("typography")}>ตัวอักษร</TabButton>
        <TabButton active={activeTab === "bubble"} onClick={() => setActiveTab("bubble")}>กล่องแชท</TabButton>
        <TabButton active={activeTab === "namebadge"} onClick={() => setActiveTab("namebadge")}>ป้ายชื่อผู้ส่ง</TabButton>
        <TabButton active={activeTab === "textcolors"} onClick={() => setActiveTab("textcolors")}>สีข้อความและชื่อ</TabButton>
        <TabButton active={activeTab === "icons"} onClick={() => setActiveTab("icons")}>ไอคอนและป้าย</TabButton>
        <TabButton active={activeTab === "animations"} onClick={() => setActiveTab("animations")}>ลูกเล่น</TabButton>
      </div>

      <div className="min-h-[380px] space-y-5">
        {activeTab === "general" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SettingsSection title="ตั้งค่าแชท (Chat Behavior)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <NumberField disabled={busy} label="จำนวนข้อความสูงสุด" min={1} onChange={(value) => setValue("maxMessages", Number(value) || 1)} value={draft.maxMessages} />
                <Field label="เรียงข้อความ">
                  <Select disabled={busy} value={draft.order} onChange={(event) => setValue("order", event.target.value)}>
                    <option value="newest-bottom">ข้อความใหม่อยู่ล่าง</option>
                    <option value="newest-top">ข้อความใหม่อยู่บน</option>
                  </Select>
                </Field>
                <Field label="ชิดขอบ (แนวตั้ง)">
                  <Select disabled={busy} value={draft.verticalAlign} onChange={(event) => setValue("verticalAlign", event.target.value)}>
                    <option value="top">ชิดขอบบน</option>
                    <option value="bottom">ชิดขอบล่าง</option>
                  </Select>
                </Field>
                <Field label="จัดแนว (แนวนอน)">
                  <Select disabled={busy} value={draft.align} onChange={(event) => setValue("align", event.target.value)}>
                    <option value="left">ชิดซ้าย</option>
                    <option value="right">ชิดขวา</option>
                  </Select>
                </Field>
                <ToggleField disabled={busy} label="ซ่อนชื่อ/แพลตฟอร์ม (Compact mode)" checked={draft.compactMode} onChange={(value) => setValue("compactMode", value)} />
                <ToggleField disabled={busy} label="แสดงชื่อและข้อความในบรรทัดเดียว" checked={draft.inlineMessage} onChange={(value) => setValue("inlineMessage", value)} />
                <ToggleField disabled={busy} label="แสดงข้อความรอแชท" checked={draft.showEmptyState} onChange={(value) => setValue("showEmptyState", value)} />
              </div>
            </SettingsSection>

            <SettingsSection title="การแสดงข้อมูล (Visibility)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ToggleField disabled={busy} label="แสดง Avatar" checked={draft.showAvatar} onChange={(value) => setValue("showAvatar", value)} />
                <ToggleField disabled={busy} label="แสดงชื่อผู้ส่ง" checked={draft.showName} onChange={(value) => setValue("showName", value)} />
                {draft.showName && (
                  <RangeField disabled={busy} label="จำกัดความยาวชื่อ (0=ไม่จำกัด)" min={0} max={30} step={1} value={draft.maxNameLength} onChange={(value) => setValue("maxNameLength", value)} />
                )}
                <ToggleField disabled={busy} label="แสดงโลโก้แพลตฟอร์ม" checked={draft.showPlatformLogo} onChange={(value) => setValue("showPlatformLogo", value)} />
                <ToggleField disabled={busy} label="แสดง User Badges" checked={draft.showBadges} onChange={(value) => setValue("showBadges", value)} />
                {draft.showBadges && (
                  <Field label="ตำแหน่ง Badge">
                    <Select disabled={busy} value={draft.badgesPosition} onChange={(event) => setValue("badgesPosition", event.target.value)}>
                      <option value="after_name">หลังชื่อผู้ใช้</option>
                      <option value="before_name">หน้าชื่อผู้ใช้</option>
                    </Select>
                  </Field>
                )}
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === "typography" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SettingsSection title="รูปแบบอักษร (Font Styles)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FontSettings 
                  disabled={busy} 
                  family={draft.nameFontFamily || draft.fontFamily} 
                  weight={draft.nameFontWeight} 
                  onFamilyChange={(value) => setValue("nameFontFamily", value)} 
                  onWeightChange={(value) => setValue("nameFontWeight", value)} 
                  labelPrefix="[ชื่อ] "
                />
                <RangeField disabled={busy} label="[ชื่อ] ขนาดตัวอักษร" min={10} max={28} step={1} value={draft.nameFontSize} onChange={(value) => setValue("nameFontSize", value)} />
                
                <div className="col-span-full h-px bg-border-base my-2" />
                
                <FontSettings 
                  disabled={busy} 
                  family={draft.fontFamily} 
                  weight={draft.fontWeight} 
                  onFamilyChange={(value) => setValue("fontFamily", value)} 
                  onWeightChange={(value) => setValue("fontWeight", value)} 
                  labelPrefix="[ข้อความ] "
                />
                <RangeField disabled={busy} label="[ข้อความ] ขนาดตัวอักษร" min={10} max={36} step={1} value={draft.fontSize} onChange={(value) => setValue("fontSize", value)} />
              </div>
            </SettingsSection>

            <SettingsSection title="ขอบและเงา (Stroke & Shadow)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="col-span-full font-semibold text-primary">การตั้งค่าชื่อผู้ส่ง</div>
                <RangeField disabled={busy} label="[ชื่อ] ความหนาขอบอักษร" min={0} max={10} step={1} value={draft.nameTextStrokeWidth} onChange={(value) => setValue("nameTextStrokeWidth", value)} />
                {draft.nameTextStrokeWidth > 0 && (
                  <ColorField disabled={busy} label="[ชื่อ] สีขอบอักษร" value={draft.nameTextStrokeColor} onChange={(value) => setValue("nameTextStrokeColor", value)} />
                )}
                
                <div className="col-span-full mt-2">
                  <ToggleField disabled={busy} label="[ชื่อ] เงาตัวอักษร" checked={draft.nameTextShadow} onChange={(value) => setValue("nameTextShadow", value)} />
                </div>
                {draft.nameTextShadow && (
                  <>
                    <ColorField disabled={busy} label="[ชื่อ] สีเงา" value={draft.nameTextShadowColor} onChange={(value) => setValue("nameTextShadowColor", value)} />
                    <RangeField disabled={busy} label="[ชื่อ] ความโปร่งใสเงา" min={0} max={1} step={0.05} value={draft.nameTextShadowOpacity} onChange={(value) => setValue("nameTextShadowOpacity", value)} />
                    <RangeField disabled={busy} label="[ชื่อ] แกน X (แนวนอน)" min={-20} max={20} step={1} value={draft.nameTextShadowX} onChange={(value) => setValue("nameTextShadowX", value)} />
                    <RangeField disabled={busy} label="[ชื่อ] แกน Y (แนวตั้ง)" min={-20} max={20} step={1} value={draft.nameTextShadowY} onChange={(value) => setValue("nameTextShadowY", value)} />
                    <RangeField disabled={busy} label="[ชื่อ] ความเบลอ" min={0} max={20} step={1} value={draft.nameTextShadowBlur} onChange={(value) => setValue("nameTextShadowBlur", value)} />
                  </>
                )}

                <div className="col-span-full mt-4 h-px bg-border-base" />
                <div className="col-span-full font-semibold text-primary">การตั้งค่าข้อความแชท</div>
                
                <RangeField disabled={busy} label="[ข้อความ] ความหนาขอบอักษร" min={0} max={10} step={1} value={draft.textStrokeWidth} onChange={(value) => setValue("textStrokeWidth", value)} />
                {draft.textStrokeWidth > 0 && (
                  <ColorField disabled={busy} label="[ข้อความ] สีขอบอักษร" value={draft.textStrokeColor} onChange={(value) => setValue("textStrokeColor", value)} />
                )}

                <div className="col-span-full mt-2">
                  <ToggleField disabled={busy} label="[ข้อความ] เงาตัวอักษร" checked={draft.textShadow} onChange={(value) => setValue("textShadow", value)} />
                </div>
                {draft.textShadow && (
                  <>
                    <ColorField disabled={busy} label="[ข้อความ] สีเงา" value={draft.textShadowColor} onChange={(value) => setValue("textShadowColor", value)} />
                    <RangeField disabled={busy} label="[ข้อความ] ความโปร่งใสเงา" min={0} max={1} step={0.05} value={draft.textShadowOpacity} onChange={(value) => setValue("textShadowOpacity", value)} />
                    <RangeField disabled={busy} label="[ข้อความ] แกน X (แนวนอน)" min={-20} max={20} step={1} value={draft.textShadowX} onChange={(value) => setValue("textShadowX", value)} />
                    <RangeField disabled={busy} label="[ข้อความ] แกน Y (แนวตั้ง)" min={-20} max={20} step={1} value={draft.textShadowY} onChange={(value) => setValue("textShadowY", value)} />
                    <RangeField disabled={busy} label="[ข้อความ] ความเบลอ" min={0} max={20} step={1} value={draft.textShadowBlur} onChange={(value) => setValue("textShadowBlur", value)} />
                  </>
                )}
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === "bubble" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SettingsSection title="ขนาดและระยะห่าง (Sizing & Spacing)">
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                <RangeField disabled={busy} label="ระยะห่างระหว่างแชท" min={0} max={28} step={1} value={draft.gap} onChange={(value) => setValue("gap", value)} />
                <RangeField disabled={busy} label="Padding ขอบนอก" min={0} max={40} step={1} value={draft.padding} onChange={(value) => setValue("padding", value)} />
                <RangeField disabled={busy} label="มุมโค้งกล่อง (Border Radius)" min={0} max={32} step={1} value={draft.borderRadius} onChange={(value) => setValue("borderRadius", value)} />
                <RangeField disabled={busy} label="Padding ซ้ายขวา (ในกล่อง)" min={4} max={32} step={1} value={draft.messagePaddingX} onChange={(value) => setValue("messagePaddingX", value)} />
                <RangeField disabled={busy} label="Padding บนล่าง (ในกล่อง)" min={2} max={24} step={1} value={draft.messagePaddingY} onChange={(value) => setValue("messagePaddingY", value)} />
              </div>
            </SettingsSection>

            <SettingsSection title="สีและขอบ (Background & Border)">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="col-span-full font-semibold text-primary">พื้นหลังรวมหน้าต่าง</div>
                <ColorField disabled={busy} label="พื้นหลังรวม" value={draft.backgroundColor} onChange={(value) => setValue("backgroundColor", value)} />
                <RangeField disabled={busy} label="ความโปร่งใสพื้นหลังรวม" min={0} max={1} step={0.05} value={draft.backgroundOpacity} onChange={(value) => setValue("backgroundOpacity", value)} />
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="ใช้ไล่สี (Gradient) พื้นหลังรวม" checked={draft.backgroundGradient} onChange={(value) => setValue("backgroundGradient", value)} />
                </div>
                {draft.backgroundGradient && (
                  <>
                    <ColorField disabled={busy} label="สีที่สอง (Gradient)" value={draft.backgroundGradientColor} onChange={(value) => setValue("backgroundGradientColor", value)} />
                    <RangeField disabled={busy} label="องศา Gradient" min={0} max={360} step={1} value={draft.backgroundGradientAngle} onChange={(value) => setValue("backgroundGradientAngle", value)} />
                  </>
                )}

                <div className="col-span-full mt-4 h-px bg-border-base" />
                <div className="col-span-full font-semibold text-primary">กล่องข้อความ</div>
                <ColorField disabled={busy} label="พื้นหลังกล่องแชท" value={draft.bubbleColor} onChange={(value) => setValue("bubbleColor", value)} />
                <RangeField disabled={busy} label="ความโปร่งใสกล่องแชท" min={0} max={1} step={0.05} value={draft.bubbleOpacity} onChange={(value) => setValue("bubbleOpacity", value)} />
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="ใช้ไล่สี (Gradient) กล่องแชท" checked={draft.bubbleGradient} onChange={(value) => setValue("bubbleGradient", value)} />
                </div>
                {draft.bubbleGradient && (
                  <>
                    <ColorField disabled={busy} label="สีที่สอง (Gradient)" value={draft.bubbleGradientColor} onChange={(value) => setValue("bubbleGradientColor", value)} />
                    <RangeField disabled={busy} label="องศา Gradient" min={0} max={360} step={1} value={draft.bubbleGradientAngle} onChange={(value) => setValue("bubbleGradientAngle", value)} />
                  </>
                )}

                <div className="col-span-full mt-4 h-px bg-border-base" />
                <div className="col-span-full font-semibold text-primary">ขอบกล่องข้อความ</div>
                <ColorField disabled={busy} label="สีขอบกล่อง" value={draft.borderColor} onChange={(value) => setValue("borderColor", value)} />
                <RangeField disabled={busy} label="ความโปร่งใสขอบกล่อง" min={0} max={1} step={0.05} value={draft.borderOpacity} onChange={(value) => setValue("borderOpacity", value)} />
                <RangeField disabled={busy} label="ความหนาขอบกล่อง" min={0} max={10} step={1} value={draft.borderWidth} onChange={(value) => setValue("borderWidth", value)} />
              </div>
            </SettingsSection>

            <SettingsSection title="เงากล่องแชท (Drop Shadow)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="เปิดใช้เงากล่องแชท" checked={draft.bubbleDropShadow} onChange={(value) => setValue("bubbleDropShadow", value)} />
                </div>
                {draft.bubbleDropShadow && (
                  <>
                    <ColorField disabled={busy} label="สีเงา" value={draft.bubbleShadowColor} onChange={(value) => setValue("bubbleShadowColor", value)} />
                    <RangeField disabled={busy} label="ความโปร่งใสเงา" min={0} max={1} step={0.05} value={draft.bubbleShadowOpacity} onChange={(value) => setValue("bubbleShadowOpacity", value)} />
                    <RangeField disabled={busy} label="แกน X (แนวนอน)" min={-50} max={50} step={1} value={draft.bubbleShadowX} onChange={(value) => setValue("bubbleShadowX", value)} />
                    <RangeField disabled={busy} label="แกน Y (แนวตั้ง)" min={-50} max={50} step={1} value={draft.bubbleShadowY} onChange={(value) => setValue("bubbleShadowY", value)} />
                    <RangeField disabled={busy} label="ความเบลอ" min={0} max={50} step={1} value={draft.bubbleShadowBlur} onChange={(value) => setValue("bubbleShadowBlur", value)} />
                  </>
                )}
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === "namebadge" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SettingsSection title="การแยกกรอบชื่อ (Separate Badge)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="แยกกรอบชื่อผู้ส่งออกจากข้อความ" checked={draft.separateBubbles} onChange={(value) => setValue("separateBubbles", value)} />
                </div>
                <RangeField
                  disabled={busy}
                  label="ระยะห่างชื่อผู้ส่งกับข้อความ"
                  max={20}
                  min={0}
                  onChange={(value) => setValue("nameMessageSpacing", value)}
                  step={1}
                  value={draft.nameMessageSpacing}
                />
              </div>
            </SettingsSection>

            {draft.separateBubbles && (
              <>
                <SettingsSection title="รูปแบบป้ายชื่อ (Badge Style)">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <ColorField disabled={busy} label="สีพื้นหลังกรอบชื่อ" value={draft.nameBubbleColor} onChange={(value) => setValue("nameBubbleColor", value)} />
                    <RangeField disabled={busy} label="ความโปร่งใสพื้นหลัง" min={0} max={1} step={0.05} value={draft.nameBubbleOpacity} onChange={(value) => setValue("nameBubbleOpacity", value)} />
                    <RangeField disabled={busy} label="ความโค้งมนกรอบชื่อ" min={0} max={32} step={1} value={draft.nameBorderRadius} onChange={(value) => setValue("nameBorderRadius", value)} />
                    
                    <div className="col-span-full">
                      <ToggleField disabled={busy} label="ใช้ไล่สี (Gradient) กรอบชื่อ" checked={draft.nameBubbleGradient} onChange={(value) => setValue("nameBubbleGradient", value)} />
                    </div>
                    {draft.nameBubbleGradient && (
                      <>
                        <ColorField disabled={busy} label="สีที่สอง (Gradient)" value={draft.nameBubbleGradientColor} onChange={(value) => setValue("nameBubbleGradientColor", value)} />
                        <RangeField disabled={busy} label="องศา Gradient" min={0} max={360} step={1} value={draft.nameBubbleGradientAngle} onChange={(value) => setValue("nameBubbleGradientAngle", value)} />
                      </>
                    )}

                    <div className="col-span-full mt-4 h-px bg-border-base" />
                    
                    <ColorField disabled={busy} label="สีขอบกรอบชื่อ" value={draft.nameBorderColor} onChange={(value) => setValue("nameBorderColor", value)} />
                    <RangeField disabled={busy} label="ความหนาขอบกรอบชื่อ" min={0} max={20} step={1} value={draft.nameBorderWidth} onChange={(value) => setValue("nameBorderWidth", value)} />
                    <RangeField disabled={busy} label="ความโปร่งใสขอบชื่อ" min={0} max={1} step={0.05} value={draft.nameBorderOpacity} onChange={(value) => setValue("nameBorderOpacity", value)} />
                  </div>
                </SettingsSection>

                <SettingsSection title="เงาป้ายชื่อ (Badge Shadow)">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="col-span-full">
                      <ToggleField disabled={busy} label="เปิดใช้เงากรอบชื่อ" checked={draft.nameBubbleDropShadow} onChange={(value) => setValue("nameBubbleDropShadow", value)} />
                    </div>
                    {draft.nameBubbleDropShadow && (
                      <>
                        <ColorField disabled={busy} label="สีเงา" value={draft.nameBubbleShadowColor} onChange={(value) => setValue("nameBubbleShadowColor", value)} />
                        <RangeField disabled={busy} label="ความโปร่งใสเงา" min={0} max={1} step={0.05} value={draft.nameBubbleShadowOpacity} onChange={(value) => setValue("nameBubbleShadowOpacity", value)} />
                        <RangeField disabled={busy} label="แกน X (แนวนอน)" min={-50} max={50} step={1} value={draft.nameBubbleShadowX} onChange={(value) => setValue("nameBubbleShadowX", value)} />
                        <RangeField disabled={busy} label="แกน Y (แนวตั้ง)" min={-50} max={50} step={1} value={draft.nameBubbleShadowY} onChange={(value) => setValue("nameBubbleShadowY", value)} />
                        <RangeField disabled={busy} label="ความเบลอ" min={0} max={50} step={1} value={draft.nameBubbleShadowBlur} onChange={(value) => setValue("nameBubbleShadowBlur", value)} />
                      </>
                    )}
                  </div>
                </SettingsSection>
              </>
            )}
          </div>
        ) : null}

        {activeTab === "textcolors" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SettingsSection title="สีข้อความแชท (Message Colors)">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <ColorField disabled={busy} label="ข้อความแชท (ทั่วไป)" value={draft.textColor} onChange={(value) => setValue("textColor", value)} />
                
                <div className="col-span-full mt-2">
                  <ToggleField disabled={busy} label="แยกสีข้อความของ สตรีมเมอร์ (Broadcaster)" checked={draft.useOwnerTextColor} onChange={(value) => setValue("useOwnerTextColor", value)} />
                </div>
                {draft.useOwnerTextColor && (
                  <ColorField disabled={busy} label="สีข้อความ สตรีมเมอร์" value={draft.ownerTextColor} onChange={(value) => setValue("ownerTextColor", value)} />
                )}
                
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="แยกสีข้อความของ แอดมิน (Moderator)" checked={draft.useModTextColor} onChange={(value) => setValue("useModTextColor", value)} />
                </div>
                {draft.useModTextColor && (
                  <ColorField disabled={busy} label="สีข้อความ แอดมิน" value={draft.modTextColor} onChange={(value) => setValue("modTextColor", value)} />
                )}
                
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="แยกสีข้อความของ สมาชิก (Member/Sub)" checked={draft.useMemberTextColor} onChange={(value) => setValue("useMemberTextColor", value)} />
                </div>
                {draft.useMemberTextColor && (
                  <ColorField disabled={busy} label="สีข้อความ สมาชิก" value={draft.memberTextColor} onChange={(value) => setValue("memberTextColor", value)} />
                )}
              </div>
            </SettingsSection>

            <SettingsSection title="สีชื่อผู้ส่ง (Name Colors)">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="สุ่มสีชื่อผู้ส่งทั่วไป" checked={draft.randomNameColor} onChange={(value) => setValue("randomNameColor", value)} />
                </div>

                <div className="col-span-full mt-2 h-px bg-border-base" />
                <div className="col-span-full font-semibold text-primary">แยกสีตามตำแหน่ง</div>
                
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="สตรีมเมอร์ (Broadcaster)" checked={draft.useOwnerNameColor} onChange={(value) => setValue("useOwnerNameColor", value)} />
                </div>
                {draft.useOwnerNameColor && (
                  <ColorField disabled={busy} label="สีชื่อ สตรีมเมอร์" value={draft.ownerNameColor} onChange={(value) => setValue("ownerNameColor", value)} />
                )}
                
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="แอดมิน (Moderator)" checked={draft.useModNameColor} onChange={(value) => setValue("useModNameColor", value)} />
                </div>
                {draft.useModNameColor && (
                  <ColorField disabled={busy} label="สีชื่อ แอดมิน" value={draft.modNameColor} onChange={(value) => setValue("modNameColor", value)} />
                )}
                
                <div className="col-span-full">
                  <ToggleField disabled={busy} label="สมาชิก (Member/Sub)" checked={draft.useMemberNameColor} onChange={(value) => setValue("useMemberNameColor", value)} />
                </div>
                {draft.useMemberNameColor && (
                  <ColorField disabled={busy} label="สีชื่อ สมาชิก" value={draft.memberNameColor} onChange={(value) => setValue("memberNameColor", value)} />
                )}

                <div className="col-span-full mt-2 h-px bg-border-base" />
                <div className="col-span-full font-semibold text-primary">สีพื้นฐานตามแพลตฟอร์ม</div>
                <ColorField disabled={busy} label="ชื่อ TikTok" value={draft.tiktokNameColor} onChange={(value) => setValue("tiktokNameColor", value)} />
                <ColorField disabled={busy} label="ชื่อ YouTube" value={draft.youtubeNameColor} onChange={(value) => setValue("youtubeNameColor", value)} />
                <ColorField disabled={busy} label="ชื่อ Twitch" value={draft.twitchNameColor} onChange={(value) => setValue("twitchNameColor", value)} />
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === "icons" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-5">
            <SettingsSection title="รูปโปรไฟล์ (Avatar)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="รูปแบบ Avatar">
                  <Select disabled={busy} value={draft.avatarShape} onChange={(event) => setValue("avatarShape", event.target.value)}>
                    <option value="circle">วงกลม</option>
                    <option value="rounded">ขอบมน</option>
                    <option value="square">สี่เหลี่ยม</option>
                  </Select>
                </Field>
                <RangeField disabled={busy} label="ขนาด Avatar" min={18} max={80} step={1} value={draft.avatarSize} onChange={(value) => setValue("avatarSize", value)} />
                <RangeField disabled={busy} label="ความหนาขอบ" min={0} max={8} step={1} value={draft.avatarBorderWidth} onChange={(value) => setValue("avatarBorderWidth", value)} />
                {draft.avatarBorderWidth > 0 && (
                  <>
                    <ColorField disabled={busy} label="สีขอบ" value={draft.avatarBorderColor} onChange={(value) => setValue("avatarBorderColor", value)} />
                    <RangeField disabled={busy} label="ความโปร่งใสขอบ" min={0} max={1} step={0.05} value={draft.avatarBorderOpacity} onChange={(value) => setValue("avatarBorderOpacity", value)} />
                  </>
                )}
              </div>
            </SettingsSection>

            <SettingsSection title="โลโก้แพลตฟอร์ม (Platform Logo)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <RangeField disabled={busy} label="ขนาดโลโก้" min={10} max={40} step={1} value={draft.platformLogoSize} onChange={(value) => setValue("platformLogoSize", value)} />
                <RangeField disabled={busy} label="ความหนาขอบ" min={0} max={8} step={1} value={draft.platformLogoBorderWidth} onChange={(value) => setValue("platformLogoBorderWidth", value)} />
                {draft.platformLogoBorderWidth > 0 && (
                  <>
                    <ColorField disabled={busy} label="สีขอบ" value={draft.platformLogoBorderColor} onChange={(value) => setValue("platformLogoBorderColor", value)} />
                    <RangeField disabled={busy} label="ความโปร่งใสขอบ" min={0} max={1} step={0.05} value={draft.platformLogoBorderOpacity} onChange={(value) => setValue("platformLogoBorderOpacity", value)} />
                  </>
                )}
              </div>
            </SettingsSection>

            <SettingsSection title="ป้ายสถานะ (Badges)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <RangeField disabled={busy} label="ขนาดป้าย" min={10} max={40} step={1} value={draft.badgeSize} onChange={(value) => setValue("badgeSize", value)} />
                <RangeField disabled={busy} label="ความหนาขอบ" min={0} max={8} step={1} value={draft.badgeBorderWidth} onChange={(value) => setValue("badgeBorderWidth", value)} />
                {draft.badgeBorderWidth > 0 && (
                  <>
                    <ColorField disabled={busy} label="สีขอบ" value={draft.badgeBorderColor} onChange={(value) => setValue("badgeBorderColor", value)} />
                    <RangeField disabled={busy} label="ความโปร่งใสขอบ" min={0} max={1} step={0.05} value={draft.badgeBorderOpacity} onChange={(value) => setValue("badgeBorderOpacity", value)} />
                  </>
                )}
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {activeTab === "animations" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SettingsSection title="แอนิเมชัน (Animations)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Animation ขาเข้า">
                  <Select disabled={busy} value={draft.animationType} onChange={(event) => setValue("animationType", event.target.value)}>
                    <option value="none">ไม่มี</option>
                    <option value="fade">ค่อยๆ ปรากฏ (Fade in)</option>
                    <option value="slide-up">เลื่อนขึ้น (Slide Up)</option>
                    <option value="slide-left">เลื่อนซ้าย (Slide Left)</option>
                    <option value="slide-right">เลื่อนขวา (Slide Right)</option>
                    <option value="pop">Pop (เด้ง)</option>
                  </Select>
                </Field>
                <Field label="Animation ขาออก">
                  <Select disabled={busy} value={draft.exitAnimationType} onChange={(event) => setValue("exitAnimationType", event.target.value)}>
                    <option value="none">ไม่มี</option>
                    <option value="fade">ค่อยๆ จางหาย (Fade out)</option>
                    <option value="slide-up">เลื่อนขึ้น (Slide Up)</option>
                    <option value="slide-left">เลื่อนซ้าย (Slide Left)</option>
                    <option value="slide-right">เลื่อนขวา (Slide Right)</option>
                    <option value="pop">Pop (หด)</option>
                  </Select>
                </Field>
                <RangeField disabled={busy} label="ความเร็วแอนิเมชัน (วินาที)" min={0.1} max={2.0} step={0.1} value={draft.animationDuration} onChange={(value) => setValue("animationDuration", value)} />
                <Field label="ซ่อนข้อความอัตโนมัติ">
                  <Select disabled={busy} value={String(draft.hideAfter)} onChange={(event) => setValue("hideAfter", Number(event.target.value))}>
                    <option value="0">ไม่ซ่อน</option>
                    <option value="5">5 วินาที</option>
                    <option value="10">10 วินาที</option>
                    <option value="15">15 วินาที</option>
                    <option value="30">30 วินาที</option>
                    <option value="60">60 วินาที</option>
                  </Select>
                </Field>
              </div>
            </SettingsSection>
          </div>
        ) : null}
      </div>
    </ResourceCard>
  );
}
