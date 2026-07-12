# Design: Rule edit UI parity + per-widget settings panels

Date: 2026-07-12
Status: Approved

## Goal

1. Make `/dashboard/rules/edit` look and behave like `/dashboard/widgets/edit` (the reference page for editor UX).
2. Give every widget type its own settings panel (currently only CHAT_WIDGET and VIEWER_COUNT_WIDGET have one), at a "moderate" depth: base styling set + type-specific fields.
3. Fix widgets that are not actually usable today: IMAGE/TEXT have config keys but no UI to set them; TTS/SOUND render debug status boxes on the stream overlay.

## Decisions (from brainstorming)

- Rule edit page adopts widgets/edit patterns; rules list page is already consistent and stays as-is.
- All remaining widget types get settings: ALERT, GOAL, EVENT_LIST, IMAGE, TEXT, SOUND, TTS.
- Depth: moderate set (colors, background + opacity, font family/size/weight, border radius, text shadow) plus type-specific fields. NOT the full 100+-option Chat treatment.
- TTS and SOUND are fully invisible on the overlay — audio only. Their settings are audio-related only (volume, default sound).
- Architecture: per-widget settings components in separate files (approach A), following the existing ChatWidgetSettings pattern; shared field primitives extracted to a common module.

## 1) Rule edit page (`apps/web/app/dashboard/rules/edit/page.tsx`)

UI-only changes; no behavior/logic changes to rule editing itself.

- Header row like widgets/edit: ghost button "กลับไปหน้า Rules" (left) + status Badge เปิด/ปิดใช้งาน (right).
- Save button uses the dirty-warning style (rose, pulse) when `isDirty` — the dirty flag already exists.
- Two-column layout on wide screens (`xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(420px,auto)]` like widgets/edit): left = form cards (พื้นฐาน / Trigger / เงื่อนไข / Actions / จังหวะเวลา), right = sticky "ทดสอบ Rule" card (plays the role Live Preview has on the widget page).
- Card headers/spacing/tones match widgets/edit conventions.

## 2) Widget settings architecture

New directory `apps/web/components/widget-settings/`:

- `fields.tsx` — shared primitives moved out of widgets/edit page.tsx: `ToggleField`, `RangeField`, `ColorField`, `FontSettings`, `NumberField`, `SettingsSection`, `TabButton`.
- `chat-settings.tsx`, `viewer-count-settings.tsx` — existing panels moved out of page.tsx (no functional change).
- New: `alert-settings.tsx`, `goal-settings.tsx`, `event-list-settings.tsx`, `image-settings.tsx`, `text-settings.tsx`, `sound-settings.tsx`, `tts-settings.tsx`.

Each settings module exports:
- `XSettingsDraft` type
- `xSettingsFromConfig(config: Record<string, unknown>): XSettingsDraft` — safe defaults matching current rendered appearance
- `XWidgetSettings` component (props: `busy`, `draft`, `isDirty`, `onDraftChange`, `onSave`, plus extras like `mediaAssets` where needed)

`widgets/edit/page.tsx` generalizes the current hardcoded chat/viewer-count draft handling into one config-draft state keyed by widget type (type → settings module map). Dirty check = `JSON.stringify(fromConfig(original)) !== JSON.stringify(draft)`, same as today. The existing Live Preview sidebar renders every type already via `WidgetRenderer`, so all panels get live preview for free.

Config is saved via existing `PATCH /widgets/:id` with `config: { ...existingConfig, ...draft }` (merge, never replace, same as chat today).

## 3) Per-widget config and renderer changes

Base set for every visual widget: `textColor`, `backgroundColor` + `backgroundOpacity`, `fontFamily`, `fontSize`, `fontWeight`, `borderRadius`, `textShadow`.

Type-specific:

| Widget | Fields |
|---|---|
| ALERT | `template` (default text), `defaultDurationMs`, `accentColor` (แถบเน้นซ้าย), `animationType` + `exitAnimationType` (none/fade/slide-up/pop), `animationDuration` |
| GOAL | `label`, `target`, `barColor`, `barBackgroundColor`, `barHeight`, `showValues`, `showPercent` |
| EVENT_LIST | `maxItems`, `accentColor`, `showHeader`, `headerText` |
| TEXT | `text`, `align` (left/center/right), `padding`, `textStrokeWidth` + `textStrokeColor` |
| IMAGE | `src` (pick from media library type IMAGE, or manual URL), `fit` (contain/cover/fill), `opacity`, `showMode` (always / triggered-only) |
| SOUND | `volume` (0–1), `src` (default sound from media library type AUDIO). No visual render. |
| TTS | `volume` (0–1). No visual render. Voice settings stay on `/dashboard/tts`. |

Renderer (`apps/web/components/widget-renderer.tsx`):

- `AlertWidget`, `GoalWidget`, `EventListWidget`, `TextWidget`, `ImageWidget` read the new keys with fallbacks identical to today's hardcoded values — existing widgets with empty config render exactly as before.
- `TTS_WIDGET` and `SOUND_WIDGET` render nothing visually (no debug StatusWidget). The hidden `<audio>` element for SOUND stays so playback keeps working; `audio.volume` comes from config. TTS playback volume (SpeechSynthesis `utterance.volume` / audio element) is applied where TTS actually plays: `apps/web/app/overlay/page.tsx` and `apps/web/app/widget/page.tsx`.
- The widgets/edit Live Preview shows a small dashboard-only placeholder for TTS/SOUND (so the editor doesn't look broken), clearly labeled as not visible on stream. Placeholder appears only in the editor preview, not on `/overlay` or `/widget` pages.

## 4) Compatibility & error handling

- All new config keys are optional; `fromConfig` supplies defaults that reproduce the current look. No DB/schema/API changes needed (`config` is already an untyped JSON column passed through `PATCH /widgets/:id`).
- Invalid values (wrong type, out of range) are clamped/defaulted by the same `number()/color()/bool()/choice()` helpers already used in the renderer.

## 5) Verification

No unit-test framework exists. Verify with:

- `pnpm typecheck` and `pnpm build`
- Manual: dashboard Live Preview per widget type (adjust values, see them apply); mock events to trigger Alert/Goal/EventList/Image; confirm TTS/SOUND render nothing on `/overlay` and `/widget` while audio still plays; confirm rules/edit matches widgets/edit visually and saving still works.
