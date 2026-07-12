# Rule Edit UI Parity + Per-Widget Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/dashboard/rules/edit` match the widgets/edit UX, and give every widget type its own settings panel (Alert, Goal, Event List, Image, Text, Sound, TTS), with TTS/Sound rendering nothing on stream.

**Architecture:** Per-widget settings components in `apps/web/components/widget-settings/` following the existing ChatWidgetSettings pattern. `widgets/edit/page.tsx` keeps one generic config-draft state dispatched by widget type. `WidgetRenderer` reads new config keys with fallbacks that reproduce today's exact appearance.

**Tech Stack:** Next.js 15 App Router (static export), React 19, Tailwind v4, framer-motion, Socket.IO client. No test framework — verification is `pnpm --filter @ezstream/web typecheck` + `pnpm build` + manual smoke.

**Spec:** `docs/superpowers/specs/2026-07-12-rule-ui-widget-settings-design.md`

## Global Constraints

- ESM everywhere; **relative imports include `.js` only in packages compiled by tsc** — `apps/web` is Next.js and uses extensionless relative imports (match surrounding files).
- All UI copy in Thai, matching existing tone (e.g. "บันทึก", "ปรับแต่ง X Widget").
- New config keys are optional; defaults must reproduce the current rendered look exactly. Theme hexes: primary `#E5FC52`, surface-base `#0F0F13`.
- Config saves always merge: `config: { ...existingConfig, ...draft }` — never replace.
- Widget config values are untrusted; renderer reads via existing `text()/number()/bool()/choice()/color()` helpers with clamps.
- Dirty-save button style (shared convention): `bg-rose-600 text-white hover:bg-rose-500 border-rose-500 animate-pulse shadow-rose-900/20`.
- No unit tests exist. Every task's test cycle = typecheck (+ build at the end) and the listed manual check.

---

### Task 1: Extract shared field primitives and move Chat/ViewerCount settings out of page.tsx

**Files:**
- Create: `apps/web/components/widget-settings/config.ts`
- Create: `apps/web/components/widget-settings/fields.tsx`
- Create: `apps/web/components/widget-settings/chat-settings.tsx`
- Create: `apps/web/components/widget-settings/viewer-count-settings.tsx`
- Modify: `apps/web/app/dashboard/widgets/edit/page.tsx`

**Interfaces:**
- Produces: `config.ts` exports `configNumber(config: Record<string, unknown>, key: string, fallback: number): number`, `configString(..., fallback: string): string`, `configBool(..., fallback: boolean): boolean`.
- Produces: `fields.tsx` exports `TabButton`, `SettingsSection`, `SettingsHeader`, `ToggleField`, `ColorField`, `RangeField`, `NumberField`, `FontSettings` (signatures identical to the current in-page versions, plus new `SettingsHeader`).
- Produces: `chat-settings.tsx` exports `ChatSettingsDraft` (type), `chatSettingsFromConfig(config): ChatSettingsDraft`, `ChatWidgetSettings` component (props unchanged: `busy, draft, isDirty?, onDraftChange, onReset, onSave`).
- Produces: `viewer-count-settings.tsx` exports `viewerCountSettingsFromConfig(config)`, `ViewerCountWidgetSettings` component (props unchanged).

- [ ] **Step 1: Create `config.ts`**

```ts
export function configNumber(config: Record<string, unknown>, key: string, fallback: number) {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function configString(config: Record<string, unknown>, key: string, fallback: string) {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

export function configBool(config: Record<string, unknown>, key: string, fallback: boolean) {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}
```

- [ ] **Step 2: Create `fields.tsx`**

Header:

```tsx
"use client";

import { Button } from "@ezstream/ui";
import { useEffect, useRef, useState } from "react";
import { Field, Input, Select } from "../ui-kit";
```

Move these functions **verbatim** from `apps/web/app/dashboard/widgets/edit/page.tsx` (current line refs) and add `export` to each:
- `NumberField` (page.tsx:820-830)
- `TabButton` (page.tsx:1306-1320)
- `SettingsSection` (page.tsx:1322-1333)
- `ToggleField` (page.tsx:1335-1354)
- `ColorField` (page.tsx:1356-1374)
- `RangeField` (page.tsx:1376-1391)
- `FontSettings` (page.tsx:1512-1675)

Add one new component (the repeated save-header used by every panel):

```tsx
export function SettingsHeader({ busy, description, isDirty, onSave, title }: {
  busy: boolean;
  description: string;
  isDirty: boolean;
  onSave: () => Promise<void>;
  title: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-base font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs font-medium text-ink-subtle">{description}</p>
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
  );
}
```

- [ ] **Step 3: Create `chat-settings.tsx`**

Header:

```tsx
"use client";

import { Button } from "@ezstream/ui";
import { useState } from "react";
import { ResourceCard } from "../resource-card";
import { Field, Select } from "../ui-kit";
import { configBool, configNumber, configString } from "./config";
import { ColorField, FontSettings, NumberField, RangeField, SettingsSection, TabButton, ToggleField } from "./fields";
```

Move **verbatim** from page.tsx, adding `export` to the type and the two functions:
- `type ChatSettingsDraft` (page.tsx:39-152)
- `chatSettingsFromConfig` (page.tsx:252-367)
- `ChatWidgetSettings` (page.tsx:832-1304)

- [ ] **Step 4: Create `viewer-count-settings.tsx`**

Header:

```tsx
"use client";

import { Button } from "@ezstream/ui";
import { ResourceCard } from "../resource-card";
import { Field } from "../ui-kit";
import { useUnsavedChangesWarning } from "../../lib/use-unsaved-changes-warning";
import { configBool, configNumber, configString } from "./config";
import { ColorField, FontSettings, RangeField, SettingsSection, ToggleField } from "./fields";
```

Move **verbatim**, adding `export`:
- `viewerCountSettingsFromConfig` (page.tsx:369-394)
- `ViewerCountWidgetSettings` (page.tsx:1393-1510)

- [ ] **Step 5: Update page.tsx**

Delete every moved declaration from page.tsx (the line ranges above, plus `configNumber`/`configString`/`configBool` at page.tsx:160-173). Keep `configObject` (page.tsx:154-158). Replace the import block additions:

```tsx
import { chatSettingsFromConfig, ChatWidgetSettings, type ChatSettingsDraft } from "../../../../components/widget-settings/chat-settings";
import { viewerCountSettingsFromConfig, ViewerCountWidgetSettings } from "../../../../components/widget-settings/viewer-count-settings";
import { NumberField } from "../../../../components/widget-settings/fields";
```

Remove now-unused imports from page.tsx (`Field`, `Select` stay only if still used by the core form — they are, keep them; drop nothing else blindly: let typecheck/`next lint` flag unused).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @ezstream/web typecheck`
Expected: PASS (no errors)

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/widget-settings apps/web/app/dashboard/widgets/edit/page.tsx
git commit -m "refactor(web): extract widget settings panels and shared fields from widgets/edit page"
```

---

### Task 2: Generalize config-draft handling in widgets/edit page

**Files:**
- Modify: `apps/web/app/dashboard/widgets/edit/page.tsx`

**Interfaces:**
- Consumes: `chatSettingsFromConfig`, `viewerCountSettingsFromConfig` from Task 1.
- Produces: page-local `function draftFromWidget(widget: Widget): Record<string, unknown> | null` — the single dispatch point later tasks extend with new cases; page-local `saveConfigSettings(): Promise<void>`; single state `configDraft: Record<string, unknown> | null`.

- [ ] **Step 1: Replace the per-type draft state with one generic draft**

In `WidgetDetailContent`, replace

```tsx
const [chatDraft, setChatDraft] = useState<ChatSettingsDraft>(() => chatSettingsFromConfig({}));
const [viewerCountDraft, setViewerCountDraft] = useState<Record<string, any>>(() => viewerCountSettingsFromConfig({}));
```

with

```tsx
const [configDraft, setConfigDraft] = useState<Record<string, unknown> | null>(null);
```

Add above the component (module scope):

```tsx
function draftFromWidget(widget: Widget): Record<string, unknown> | null {
  const config = configObject(widget);
  switch (widget.type) {
    case "CHAT_WIDGET":
      return chatSettingsFromConfig(config);
    case "VIEWER_COUNT_WIDGET":
      return viewerCountSettingsFromConfig(config);
    default:
      return null;
  }
}
```

- [ ] **Step 2: Rewire derived values**

Replace `previewConfig` computation:

```tsx
const previewConfig = configDraft ? { ...widgetConfig, ...configDraft } : widgetConfig;
```

Replace `isChatDirty`/`isViewerCountDirty` with:

```tsx
const isConfigDirty = useMemo(() => {
  if (!widget || !configDraft) return false;
  const original = draftFromWidget(widget);
  return original ? JSON.stringify(configDraft) !== JSON.stringify(original) : false;
}, [widget, configDraft]);

const isDirty = isCoreDirty || isConfigDirty;
```

In `handleSaveAndLeave`, replace the chat/viewer-count branch with:

```tsx
if (isConfigDirty && configDraft) {
  updates.config = { ...widgetConfig, ...configDraft };
}
```

In `syncDraft`, replace the type-specific `setChatDraft`/`setViewerCountDraft` calls with:

```tsx
setConfigDraft(draftFromWidget(nextWidget));
```

Replace `saveChatSettings`/`saveViewerCountSettings` with:

```tsx
async function saveConfigSettings() {
  if (!configDraft) return;
  await updateWidget({ config: { ...widgetConfig, ...configDraft } }, "บันทึกการตั้งค่า Widget แล้ว");
}
```

- [ ] **Step 3: Rewire panel rendering**

Replace the `{isChatWidget ? <ChatWidgetSettings .../> : null}` and viewer-count blocks with:

```tsx
{widget && configDraft && widget.type === "CHAT_WIDGET" ? (
  <ChatWidgetSettings
    busy={busy}
    draft={configDraft as ChatSettingsDraft}
    isDirty={isConfigDirty}
    onDraftChange={setConfigDraft}
    onReset={() => setConfigDraft(chatSettingsFromConfig({}))}
    onSave={saveConfigSettings}
  />
) : null}

{widget && configDraft && widget.type === "VIEWER_COUNT_WIDGET" ? (
  <ViewerCountWidgetSettings busy={busy} draft={configDraft} isDirty={isConfigDirty} onDraftChange={setConfigDraft} onSave={saveConfigSettings} />
) : null}
```

Keep `isChatWidget` (still used for chat preview messages/socket). `isViewerCountWidget` becomes unused — remove it.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @ezstream/web typecheck`
Expected: PASS

- [ ] **Step 5: Manual check**

Run `pnpm dev`, open a CHAT_WIDGET in `/dashboard/widgets/edit?id=...`: change a chat setting → save button pulses → save → reload → value persists. Same for a VIEWER_COUNT_WIDGET.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dashboard/widgets/edit/page.tsx
git commit -m "refactor(web): generic config draft handling in widget edit page"
```

---

### Task 3: Configurable renderers; TTS/Sound invisible on stream

**Files:**
- Modify: `apps/web/components/widget-renderer.tsx`
- Modify: `apps/web/app/dashboard/widgets/edit/page.tsx` (editor-only preview placeholder)

**Interfaces:**
- Consumes: existing helpers `text/number/bool/choice/clamp/color/rgba/getSmoothOutlineShadows/resolveMediaSrc` in widget-renderer.tsx.
- Produces: config keys read by renderer per type (exact names below) — the settings panels in Tasks 4–6 must write these same keys. New module-scope helpers `fontWeightValue(value: string): number` and `fontFamilyValue(family: string): string | undefined`.

- [ ] **Step 1: Add font helpers to widget-renderer.tsx (module scope, near `rgba`)**

```tsx
function fontWeightValue(value: string): number {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isNaN(numeric)) return clamp(numeric, 100, 900);
  return value === "black" ? 900 : value === "bold" ? 700 : value === "medium" ? 500 : 400;
}

function fontFamilyValue(family: string): string | undefined {
  if (!family || family === "system") return undefined;
  if (family === "mono") return "ui-monospace, SFMono-Regular, monospace";
  return `"${family}", sans-serif`;
}
```

- [ ] **Step 2: Make TTS/Sound render nothing; apply sound volume**

In `WidgetRenderer`'s `body` switch, change:

```tsx
case "TTS_WIDGET":
  return null;
...
case "SOUND_WIDGET":
  return null;
```

In the SOUND playback effect, set volume before playing:

```tsx
useEffect(() => {
  if (widget.type === "SOUND_WIDGET" && state.playing && audioRef.current) {
    audioRef.current.volume = clamp(number(config.volume, 1), 0, 1);
    audioRef.current.currentTime = 0;
    void audioRef.current.play();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [widget.type, state.playing, state.lastTriggeredAt]);
```

- [ ] **Step 3: Replace `AlertWidget`**

Config keys: `template, defaultDurationMs, showLabel, accentColor, textColor, backgroundColor, backgroundOpacity, fontFamily, fontSize, fontWeight, borderRadius, textShadow, animationType, exitAnimationType, animationDuration`.

```tsx
function AlertWidget({ widget }: { widget: OverlayWidget }) {
  const state = widget.state?.state ?? {};
  const config = widget.config ?? {};
  const lastAction = (state.lastAction ?? {}) as Record<string, unknown>;
  const message = text(state.renderedText) || text(lastAction.renderedText) || text(config.template) || widget.name;
  const durationMs = number(lastAction.durationMs, number(config.defaultDurationMs, 0));
  const triggeredAt = typeof state.lastTriggeredAt === "string" ? Date.parse(state.lastTriggeredAt) : 0;
  const [now, setNow] = useState(() => Date.now());

  const backgroundColor = rgba(color(config.backgroundColor, "#000000"), clamp(number(config.backgroundOpacity, 0.7), 0, 1));
  const accentColor = color(config.accentColor, "#E5FC52");
  const textColor = color(config.textColor, "#ffffff");
  const fontSize = clamp(number(config.fontSize, 30), 10, 96);
  const fontFamily = fontFamilyValue(text(config.fontFamily, "system"));
  const fontWeight = fontWeightValue(text(config.fontWeight, "black"));
  const borderRadius = clamp(number(config.borderRadius, 0), 0, 48);
  const showLabel = bool(config.showLabel, true);
  const textShadow = bool(config.textShadow, false) ? "0 1px 2px rgba(0,0,0,0.55)" : undefined;
  const animationType = choice(config.animationType, ["none", "fade", "slide-up", "pop"] as const, "none");
  const exitAnimationType = choice(config.exitAnimationType, ["none", "fade", "slide-up", "pop"] as const, animationType);
  const animationDuration = clamp(number(config.animationDuration, 0.3), 0.1, 2);

  useEffect(() => {
    if (!durationMs || !triggeredAt) return;
    const remaining = triggeredAt + durationMs - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [durationMs, triggeredAt]);

  const visible = !durationMs || !triggeredAt || now - triggeredAt < durationMs;

  const initial: Record<string, number> = {};
  if (animationType === "fade") initial.opacity = 0;
  if (animationType === "slide-up") { initial.opacity = 0; initial.y = 20; }
  if (animationType === "pop") { initial.opacity = 0; initial.scale = 0.5; }
  const exit: Record<string, number> = {};
  if (exitAnimationType === "fade") exit.opacity = 0;
  if (exitAnimationType === "slide-up") { exit.opacity = 0; exit.y = -20; }
  if (exitAnimationType === "pop") { exit.opacity = 0; exit.scale = 0.5; }

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key={triggeredAt || "alert"}
          initial={initial}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={exit}
          transition={{ duration: animationDuration }}
          className="flex h-full items-center gap-4 p-5"
          style={{ background: backgroundColor, borderLeft: `4px solid ${accentColor}`, borderRadius, fontFamily }}
        >
          <div>
            {showLabel ? <p className="mb-1 text-xs font-semibold text-ink-subtle">Alert</p> : null}
            <p className="leading-tight" style={{ color: textColor, fontSize, fontWeight, textShadow }}>{message}</p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Replace `GoalWidget`**

Config keys: `label, target, showValues, showPercent, barColor, barBackgroundColor, barBackgroundOpacity, barHeight, textColor, backgroundColor, backgroundOpacity, fontFamily, fontSize, fontWeight, borderRadius`.

```tsx
function GoalWidget({ widget }: { widget: OverlayWidget }) {
  const state = widget.state?.state ?? {};
  const config = widget.config ?? {};
  const current = number(state.current, 0);
  const target = Math.max(1, number(state.target, number(config.target, 100)));
  const progress = Math.max(0, Math.min(100, (current / target) * 100));

  const backgroundColor = rgba(color(config.backgroundColor, "#000000"), clamp(number(config.backgroundOpacity, 0.7), 0, 1));
  const textColor = color(config.textColor, "#ffffff");
  const barColor = color(config.barColor, "#E5FC52");
  const barBackgroundColor = rgba(color(config.barBackgroundColor, "#0F0F13"), clamp(number(config.barBackgroundOpacity, 0.5), 0, 1));
  const barHeight = clamp(number(config.barHeight, 24), 4, 80);
  const fontSize = clamp(number(config.fontSize, 12), 8, 48);
  const fontFamily = fontFamilyValue(text(config.fontFamily, "system"));
  const fontWeight = fontWeightValue(text(config.fontWeight, "600"));
  const borderRadius = clamp(number(config.borderRadius, 0), 0, 48);
  const showValues = bool(config.showValues, true);
  const showPercent = bool(config.showPercent, false);

  return (
    <div className="flex h-full flex-col justify-center p-5" style={{ background: backgroundColor, borderRadius, fontFamily }}>
      <div className="mb-3 flex justify-between" style={{ color: textColor, fontSize, fontWeight }}>
        <span>{text(config.label, "Goal")}</span>
        {showValues ? (
          <span style={{ color: barColor }}>
            {current}/{target}
            {showPercent ? ` (${Math.round(progress)}%)` : ""}
          </span>
        ) : null}
      </div>
      <div style={{ height: barHeight, background: barBackgroundColor, borderRadius }}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progress}%`, background: barColor, borderRadius }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Replace `EventListWidget`**

Config keys: `maxItems, showHeader, headerText, accentColor, itemBackgroundColor, itemBackgroundOpacity, textColor, backgroundColor, backgroundOpacity, fontFamily, fontSize, fontWeight, borderRadius`.

```tsx
function EventListWidget({ widget }: { widget: OverlayWidget }) {
  const config = widget.config ?? {};
  const maxItems = Math.round(clamp(number(config.maxItems, 8), 1, 20));
  const items = Array.isArray(widget.state?.state?.items) ? widget.state.state.items.slice(0, maxItems) : [];
  const backgroundColor = rgba(color(config.backgroundColor, "#000000"), clamp(number(config.backgroundOpacity, 0.7), 0, 1));
  const itemBackground = rgba(color(config.itemBackgroundColor, "#0F0F13"), clamp(number(config.itemBackgroundOpacity, 0.4), 0, 1));
  const accentColor = color(config.accentColor, "#E5FC52");
  const textColor = color(config.textColor, "#ffffff");
  const fontSize = clamp(number(config.fontSize, 12), 8, 32);
  const fontFamily = fontFamilyValue(text(config.fontFamily, "system"));
  const fontWeight = fontWeightValue(text(config.fontWeight, "bold"));
  const borderRadius = clamp(number(config.borderRadius, 0), 0, 32);
  const showHeader = bool(config.showHeader, true);

  return (
    <div className="h-full space-y-3 overflow-hidden p-4" style={{ background: backgroundColor, fontFamily }}>
      {showHeader ? <p className="mb-2 text-xs font-semibold text-ink-subtle">{text(config.headerText, "Recent Events")}</p> : null}
      {items.map((item, index) => {
        const renderedText = item && typeof item === "object" ? text((item as Record<string, unknown>).renderedText) : "";
        return (
          <p key={index} className="truncate px-3 py-2" style={{ background: itemBackground, borderLeft: `2px solid ${accentColor}`, color: textColor, fontSize, fontWeight, borderRadius }}>
            {renderedText || JSON.stringify(item)}
          </p>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Replace `TextWidget`**

Config keys: `text, align, textColor, backgroundColor, backgroundOpacity, fontFamily, fontSize, fontWeight, padding, borderRadius, textShadow, textStrokeWidth, textStrokeColor`.

```tsx
function TextWidget({ widget }: { widget: OverlayWidget }) {
  const config = widget.config ?? {};
  const value = text(widget.state?.state?.text) || text(config.text) || widget.name;
  const fontSize = clamp(number(config.fontSize, 28), 8, 200);
  const fontFamily = fontFamilyValue(text(config.fontFamily, "system"));
  const fontWeight = fontWeightValue(text(config.fontWeight, "black"));
  const textColor = color(config.textColor, "#ffffff");
  const align = choice(config.align, ["left", "center", "right"] as const, "left");
  const backgroundColor = rgba(color(config.backgroundColor, "#000000"), clamp(number(config.backgroundOpacity, 0.7), 0, 1));
  const padding = clamp(number(config.padding, 16), 0, 80);
  const borderRadius = clamp(number(config.borderRadius, 0), 0, 48);
  const shadow = bool(config.textShadow, false) ? "0 1px 2px rgba(0,0,0,0.55)" : "";
  const strokeWidth = clamp(number(config.textStrokeWidth, 0), 0, 10);
  const strokeColor = color(config.textStrokeColor, "#000000");
  const stroke = useMemo(() => getSmoothOutlineShadows(strokeWidth, strokeColor), [strokeWidth, strokeColor]);
  const justifyContent = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const textShadow = [stroke, shadow].filter(Boolean).join(", ") || undefined;

  return (
    <div className="flex h-full items-center" style={{ background: backgroundColor, padding, borderRadius, justifyContent }}>
      <span style={{ color: textColor, fontSize, fontFamily, fontWeight, textAlign: align, textShadow }}>{value}</span>
    </div>
  );
}
```

- [ ] **Step 7: Replace `ImageWidget`**

Config keys: `src` (or legacy `url`), `fit, opacity, borderRadius, showMode, defaultDurationMs`. Keep the "ยังไม่มีรูป" StatusWidget when no src (unchanged behavior).

```tsx
function ImageWidget({ widget }: { widget: OverlayWidget }) {
  const state = widget.state?.state ?? {};
  const config = widget.config ?? {};
  const rawSrc = text(config.src) || text(config.url) || text(state.src);
  const src = rawSrc ? resolveMediaSrc(rawSrc) : "";
  const lastAction = (state.lastAction ?? {}) as Record<string, unknown>;
  const showMode = choice(config.showMode, ["always", "triggered"] as const, "always");
  const durationMs = number(lastAction.durationMs, number(config.defaultDurationMs, showMode === "triggered" ? 5000 : 0));
  const triggeredAt = typeof state.lastTriggeredAt === "string" ? Date.parse(state.lastTriggeredAt) : 0;
  const fit = choice(config.fit, ["contain", "cover", "fill"] as const, "contain");
  const opacity = clamp(number(config.opacity, 1), 0, 1);
  const borderRadius = clamp(number(config.borderRadius, 0), 0, 200);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!durationMs || !triggeredAt) return;
    const remaining = triggeredAt + durationMs - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [durationMs, triggeredAt]);

  const withinDuration = triggeredAt > 0 && durationMs > 0 && now - triggeredAt < durationMs;
  const visible = showMode === "triggered" ? withinDuration : !durationMs || !triggeredAt || now - triggeredAt < durationMs;
  if (!src || !visible) return src ? <div className="h-full" /> : <StatusWidget label="Image" value="ยังไม่มีรูป" />;

  return <img src={src} alt={widget.name} className="h-full w-full" style={{ objectFit: fit, opacity, borderRadius }} />;
}
```

- [ ] **Step 8: Editor-only preview placeholder for TTS/Sound**

In `apps/web/app/dashboard/widgets/edit/page.tsx`, in the Live Preview aside, wrap the `ScalableWidgetPreview` block:

```tsx
{widget && (widget.type === "TTS_WIDGET" || widget.type === "SOUND_WIDGET") ? (
  <div className="border-2 border-dashed border-border-base bg-surface-dark p-6 text-center">
    <p className="text-sm font-semibold text-white">🔊 Widget เสียง — ไม่มีภาพบนสตรีม</p>
    <p className="mt-1 text-xs text-ink-subtle">widget นี้เล่นเสียงอย่างเดียว จะไม่แสดงอะไรบน Overlay/OBS</p>
  </div>
) : (
  <ScalableWidgetPreview width={Number(width) || 400} height={Number(height) || 160}>
    {deferredPreviewWidget ? <WidgetRenderer widget={deferredPreviewWidget} chatMessages={isChatWidget ? deferredChatMessages : []} /> : null}
  </ScalableWidgetPreview>
)}
```

- [ ] **Step 9: Typecheck + manual check**

Run: `pnpm --filter @ezstream/web typecheck` → PASS.
Manual: open `/overlay/{token}` with a TTS widget — no box rendered; trigger a mock chat event with the default TTS rule — sound still plays. Alert/Goal/EventList/Text with empty config look identical to before.

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/widget-renderer.tsx apps/web/app/dashboard/widgets/edit/page.tsx
git commit -m "feat(web): configurable widget renderers; hide TTS/Sound widgets on stream"
```

---

### Task 4: Alert + Goal settings panels

**Files:**
- Create: `apps/web/components/widget-settings/alert-settings.tsx`
- Create: `apps/web/components/widget-settings/goal-settings.tsx`
- Modify: `apps/web/app/dashboard/widgets/edit/page.tsx`

**Interfaces:**
- Consumes: `SettingsHeader/SettingsSection/ToggleField/ColorField/RangeField/NumberField/FontSettings` from `./fields`; `configNumber/configString/configBool` from `./config`; `draftFromWidget` + `saveConfigSettings` wiring from Task 2.
- Produces: `alertSettingsFromConfig`, `AlertWidgetSettings`, `AlertSettingsDraft`; `goalSettingsFromConfig`, `GoalWidgetSettings`, `GoalSettingsDraft`. Panel props are always `{ busy: boolean; draft: XDraft; isDirty: boolean; onDraftChange: (d: XDraft) => void; onSave: () => Promise<void> }`.

- [ ] **Step 1: Create `alert-settings.tsx`**

```tsx
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
  { value: "fade", label: "Fade" },
  { value: "slide-up", label: "Slide Up" },
  { value: "pop", label: "Pop" }
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
          <RangeField disabled={busy} label="ระยะเวลาแสดงเริ่มต้น (ms, 0 = แสดงตลอด)" min={0} max={30000} step={500} value={draft.defaultDurationMs} onChange={(value) => setValue("defaultDurationMs", value)} />
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
```

- [ ] **Step 2: Create `goal-settings.tsx`**

```tsx
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
```

- [ ] **Step 3: Wire into page.tsx**

Add imports:

```tsx
import { alertSettingsFromConfig, AlertWidgetSettings, type AlertSettingsDraft } from "../../../../components/widget-settings/alert-settings";
import { goalSettingsFromConfig, GoalWidgetSettings, type GoalSettingsDraft } from "../../../../components/widget-settings/goal-settings";
```

Add cases to `draftFromWidget`:

```tsx
case "ALERT_WIDGET":
  return alertSettingsFromConfig(config);
case "GOAL_WIDGET":
  return goalSettingsFromConfig(config);
```

Add panels next to the chat/viewer-count blocks:

```tsx
{widget && configDraft && widget.type === "ALERT_WIDGET" ? (
  <AlertWidgetSettings busy={busy} draft={configDraft as AlertSettingsDraft} isDirty={isConfigDirty} onDraftChange={setConfigDraft} onSave={saveConfigSettings} />
) : null}

{widget && configDraft && widget.type === "GOAL_WIDGET" ? (
  <GoalWidgetSettings busy={busy} draft={configDraft as GoalSettingsDraft} isDirty={isConfigDirty} onDraftChange={setConfigDraft} onSave={saveConfigSettings} />
) : null}
```

- [ ] **Step 4: Typecheck + manual check**

Run: `pnpm --filter @ezstream/web typecheck` → PASS.
Manual: edit an ALERT_WIDGET — change accent color → Live Preview updates instantly → save → reload → persists. Same for GOAL_WIDGET (bar color, target).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/widget-settings apps/web/app/dashboard/widgets/edit/page.tsx
git commit -m "feat(web): alert and goal widget settings panels"
```

---

### Task 5: Event List + Text settings panels

**Files:**
- Create: `apps/web/components/widget-settings/event-list-settings.tsx`
- Create: `apps/web/components/widget-settings/text-settings.tsx`
- Modify: `apps/web/app/dashboard/widgets/edit/page.tsx`

**Interfaces:**
- Same panel-prop convention as Task 4. Produces `eventListSettingsFromConfig/EventListWidgetSettings/EventListSettingsDraft` and `textSettingsFromConfig/TextWidgetSettings/TextSettingsDraft`.

- [ ] **Step 1: Create `event-list-settings.tsx`**

```tsx
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
    headerText: configString(config, "headerText", "Recent Events"),
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
```

- [ ] **Step 2: Create `text-settings.tsx`**

```tsx
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
          <RangeField disabled={busy} label="Padding" min={0} max={80} step={1} value={draft.padding} onChange={(value) => setValue("padding", value)} />
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
```

- [ ] **Step 3: Wire into page.tsx** (same pattern as Task 4 Step 3 — imports, `draftFromWidget` cases `EVENT_LIST_WIDGET`/`TEXT_WIDGET`, two panel blocks casting `configDraft as EventListSettingsDraft` / `as TextSettingsDraft`)

- [ ] **Step 4: Typecheck + manual check**

Run: `pnpm --filter @ezstream/web typecheck` → PASS.
Manual: TEXT_WIDGET — type text, change align/color → preview updates → save persists. EVENT_LIST_WIDGET — toggle header, change accent → preview updates.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/widget-settings apps/web/app/dashboard/widgets/edit/page.tsx
git commit -m "feat(web): event list and text widget settings panels"
```

---

### Task 6: Image + Sound + TTS settings panels (with media library pickers)

**Files:**
- Create: `apps/web/components/widget-settings/image-settings.tsx`
- Create: `apps/web/components/widget-settings/sound-settings.tsx`
- Create: `apps/web/components/widget-settings/tts-settings.tsx`
- Modify: `apps/web/app/dashboard/widgets/edit/page.tsx`

**Interfaces:**
- Consumes: `GET /media` returns assets with `{ id, originalName, type ("IMAGE"|"AUDIO"), publicPath }`; `publicPath` starts with `/` and is resolved by the renderer's `resolveMediaSrc`.
- Produces: `imageSettingsFromConfig/ImageWidgetSettings/ImageSettingsDraft` (extra prop `mediaAssets: MediaAssetOption[]`), `soundSettingsFromConfig/SoundWidgetSettings/SoundSettingsDraft` (extra prop `mediaAssets`), `ttsSettingsFromConfig/TtsWidgetSettings/TtsSettingsDraft`. Shared type `MediaAssetOption = { id: string; originalName: string; type: string; publicPath: string }` exported from `image-settings.tsx`.

- [ ] **Step 1: Create `image-settings.tsx`**

```tsx
"use client";

import { ResourceCard } from "../resource-card";
import { Field, Input, Select } from "../ui-kit";
import { configNumber, configString } from "./config";
import { ColorField, RangeField, SettingsHeader, SettingsSection } from "./fields";

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
            <Select disabled={busy} value={selectedAsset?.id ?? ""} onChange={(event) => {
              const asset = imageAssets.find((item) => item.id === event.target.value);
              setValue("src", asset?.publicPath ?? "");
            }}>
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
```

Note: `ColorField` is imported but unused in the final panel — do not import it (adjust imports to exactly what's used).

- [ ] **Step 2: Create `sound-settings.tsx`**

```tsx
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
            <Select disabled={busy} value={selectedAsset?.id ?? ""} onChange={(event) => {
              const asset = audioAssets.find((item) => item.id === event.target.value);
              setValue("src", asset?.publicPath ?? "");
            }}>
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
```

- [ ] **Step 3: Create `tts-settings.tsx`**

```tsx
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
```

- [ ] **Step 4: Wire into page.tsx**

Add a media-assets load. Add type + state:

```tsx
import type { MediaAssetOption } from "../../../../components/widget-settings/image-settings";
// ...
const [mediaAssets, setMediaAssets] = useState<MediaAssetOption[]>([]);
```

In `load()`, extend the `Promise.all`:

```tsx
const [nextWidget, nextOverlays, nextMedia] = await Promise.all([
  api<Widget>(`/widgets/${widgetId}`),
  api<Overlay[]>("/overlays"),
  api<MediaAssetOption[]>("/media").catch(() => [] as MediaAssetOption[])
]);
syncDraft(nextWidget);
setOverlays(nextOverlays);
setMediaAssets(nextMedia);
```

Add imports, `draftFromWidget` cases (`IMAGE_WIDGET`, `SOUND_WIDGET`, `TTS_WIDGET`), and panel blocks:

```tsx
{widget && configDraft && widget.type === "IMAGE_WIDGET" ? (
  <ImageWidgetSettings busy={busy} draft={configDraft as ImageSettingsDraft} isDirty={isConfigDirty} mediaAssets={mediaAssets} onDraftChange={setConfigDraft} onSave={saveConfigSettings} />
) : null}

{widget && configDraft && widget.type === "SOUND_WIDGET" ? (
  <SoundWidgetSettings busy={busy} draft={configDraft as SoundSettingsDraft} isDirty={isConfigDirty} mediaAssets={mediaAssets} onDraftChange={setConfigDraft} onSave={saveConfigSettings} />
) : null}

{widget && configDraft && widget.type === "TTS_WIDGET" ? (
  <TtsWidgetSettings busy={busy} draft={configDraft as TtsSettingsDraft} isDirty={isConfigDirty} onDraftChange={setConfigDraft} onSave={saveConfigSettings} />
) : null}
```

**Check the actual `/media` response shape first** (see `apps/api/src/media`): if the list endpoint doesn't include `publicPath`, adjust `MediaAssetOption` and the pickers to whatever URL field it returns.

- [ ] **Step 5: Typecheck + manual check**

Run: `pnpm --filter @ezstream/web typecheck` → PASS.
Manual: IMAGE_WIDGET — pick an uploaded image → preview shows it → save → `/widget?id=...` shows it. SOUND/TTS — settings show volume, preview aside shows the "widget เสียง" placeholder.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/widget-settings apps/web/app/dashboard/widgets/edit/page.tsx
git commit -m "feat(web): image, sound and tts widget settings panels"
```

---

### Task 7: Apply TTS widget volume in overlay and widget pages

**Files:**
- Modify: `apps/web/app/overlay/page.tsx` (speakNext at ~229-273)
- Modify: `apps/web/app/widget/page.tsx` (speakNext at ~71-110)

**Interfaces:**
- Consumes: `config.volume` on TTS_WIDGET (written by Task 6). Overlay state `state.widgets: OverlayWidget[]`; widget page has `widget` state.

- [ ] **Step 1: overlay/page.tsx**

Add a ref near the other refs in `OverlayContent`:

```tsx
const ttsWidgetVolume = useRef(1);
```

Add an effect (after the `state` declaration/effects):

```tsx
useEffect(() => {
  const ttsWidget = state?.widgets.find((item) => item.type === "TTS_WIDGET");
  const raw = ttsWidget?.config?.volume;
  ttsWidgetVolume.current = typeof raw === "number" && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
}, [state]);
```

In `speakNext`, change both volume assignments:

```tsx
audio.volume = Math.min(1, Math.max(0, next.volume * ttsWidgetVolume.current));
```

```tsx
utterance.volume = Math.min(1, Math.max(0, next.volume * ttsWidgetVolume.current));
```

- [ ] **Step 2: widget/page.tsx**

Same pattern: add `const ttsWidgetVolume = useRef(1);`, an effect reading the page's `widget` state:

```tsx
useEffect(() => {
  if (widget?.type !== "TTS_WIDGET") {
    ttsWidgetVolume.current = 1;
    return;
  }
  const raw = widget.config?.volume;
  ttsWidgetVolume.current = typeof raw === "number" && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
}, [widget]);
```

and multiply in both `speakNext` branches exactly as in Step 1.

- [ ] **Step 3: Typecheck + manual check**

Run: `pnpm --filter @ezstream/web typecheck` → PASS.
Manual: set TTS widget volume to 0.2, trigger a chat message via mock events, confirm quieter TTS on `/overlay/{token}`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/overlay/page.tsx apps/web/app/widget/page.tsx
git commit -m "feat(web): honor TTS widget volume in overlay and widget playback"
```

---

### Task 8: Rule edit page UI parity with widgets/edit

**Files:**
- Modify: `apps/web/app/dashboard/rules/edit/page.tsx`

**Interfaces:**
- Consumes: `Badge` from `../../../../components/ui-kit`, `Link` from `next/link`. No logic changes — `isDirty`, `submit`, `runTest` stay as-is.

- [ ] **Step 1: Add header row**

Add imports `Link` and `Badge`. Immediately inside `<DashboardShell title={...}>` (before the notices), add:

```tsx
<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <Button variant="ghost" size="sm" asChild>
    <Link href="/dashboard/rules">กลับไปหน้า Rules</Link>
  </Button>
  <div className="flex flex-wrap gap-2">
    <Badge tone={isEnabled ? "success" : "neutral"}>{isEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge>
    {!isNew ? <Badge tone="info">Priority {priority}</Badge> : null}
  </div>
</div>
```

Apply the same header (back button only, no badges) to the `loading` early-return shell.

- [ ] **Step 2: Two-column layout with sticky test panel**

Restructure the body: wrap the `<form>` and the "ทดสอบ Rule" ResourceCard (currently `className="mt-8 space-y-4"` after the form) in:

```tsx
<div className="flex flex-col-reverse gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(420px,auto)]">
  <form className="space-y-6" onSubmit={submit}>
    {/* existing cards: พื้นฐาน / Trigger / เงื่อนไข / Actions / จังหวะเวลา + save button — unchanged */}
  </form>
  <aside className="sticky top-28 z-20 self-start xl:top-32">
    <ResourceCard className="space-y-4">
      {/* existing ทดสอบ Rule content — unchanged, drop the mt-8 */}
    </ResourceCard>
  </aside>
</div>
```

`{UnsavedChangesModal}` stays outside the grid.

- [ ] **Step 3: Dirty-state save button**

Replace the save button's className with a conditional:

```tsx
<Button
  disabled={busy}
  type="submit"
  size="lg"
  className={
    isDirty
      ? "bg-rose-600 text-white hover:bg-rose-500 border-rose-500 animate-pulse shadow-rose-900/20 font-semibold"
      : "bg-primary text-black border-2 border-transparent hover:border-white shadow-none hover:shadow-brutal-sm transition-all active:translate-y-1 font-semibold"
  }
>
  {busy ? "กำลังบันทึก..." : "บันทึก Rule"}
</Button>
```

- [ ] **Step 4: Typecheck + manual check**

Run: `pnpm --filter @ezstream/web typecheck` → PASS.
Manual: open `/dashboard/rules/edit?id=...` — back button works, badge reflects เปิด/ปิด, editing any field makes save pulse, test panel sticks on the right at xl width and stacks above the form on mobile (`flex-col-reverse` puts the form first visually — verify; if the test panel should be BELOW on mobile, use `flex-col` instead and confirm visually which matches widgets/edit: widgets/edit uses `flex-col-reverse` so preview is on top on mobile; for rules the test panel on top is acceptable parity).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/rules/edit/page.tsx
git commit -m "feat(web): rule edit page UI parity with widget edit page"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full typecheck + build**

Run: `pnpm typecheck` → PASS across all packages.
Run: `pnpm build` → PASS (web static export succeeds).

- [ ] **Step 2: Manual smoke (use `pnpm dev`, demo account)**

1. `/dashboard/widgets` → open each widget type → its settings panel appears, Live Preview reacts, save persists after reload.
2. Widget with empty config renders identical to pre-change look (compare Alert/Goal/EventList defaults).
3. `/overlay/{token}`: TTS + Sound widgets render nothing; mock chat event still speaks TTS; PLAY_SOUND rule still plays audio at configured volume.
4. `/dashboard/rules/edit`: header/back/badges/dirty-save/sticky test panel all behave; create + edit + test rule still work.

- [ ] **Step 3: Fix anything found, commit fixes**

```bash
git add -A
git commit -m "fix(web): address issues found in manual verification"
```

(Skip if nothing found.)
