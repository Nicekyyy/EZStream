# Audio-only widgets skip overlay layout

Date: 2026-07-12

## Problem

`TTS_WIDGET` and `SOUND_WIDGET` play audio only — they render no visual content on the overlay (`WidgetRenderer` already returns `null` as the body for both, see `apps/web/components/widget-renderer.tsx`). Despite that, the rest of the stack still treats them like visual widgets:

- The overlay renderer still wraps them in an absolutely-positioned `<section>` sized to `width`/`height`, i.e. an invisible box occupying overlay layout space for no reason.
- The Overlay Editor canvas (`/overlay?editor=true`, used inside `/dashboard/overlays/edit`) still gives them a draggable/resizable `<Rnd>` box, even though there's nothing to see or usefully position.
- The dashboard "New Widget" and "Edit Widget" pages still show X/Y/Width/Height/Layer controls for them, which do nothing meaningful.

Only the Overlay-binding (`overlayId`) actually matters for these widget types — it determines which overlay's socket room they participate in / which browser source will play their audio.

## Scope

Applies to widget `type === "TTS_WIDGET"` or `type === "SOUND_WIDGET"`. No other widget types are affected. No Prisma/schema changes — `Widget.width`/`height`/`positionX`/`positionY` remain as-is on the model (still required by other widget types); this is purely a frontend rendering/UI-visibility change.

## Design

### 1. Shared helper

New file `apps/web/lib/widget-types.ts`:

```ts
export const AUDIO_ONLY_WIDGET_TYPES = ["TTS_WIDGET", "SOUND_WIDGET"] as const;
export function isAudioOnlyWidgetType(type: string): boolean {
  return (AUDIO_ONLY_WIDGET_TYPES as readonly string[]).includes(type);
}
```

Used by all four consumers below, replacing the ad-hoc `type === "TTS_WIDGET" || type === "SOUND_WIDGET"` checks (one already exists at `apps/web/app/dashboard/widgets/edit/page.tsx:592`).

### 2. Overlay renderer — `apps/web/components/widget-renderer.tsx`

Currently (`WidgetRenderer`, ~line 237-242) every widget is wrapped:

```tsx
<section className="absolute overflow-hidden rounded-none text-white" style={style}>
  {body}
  {widget.type === "SOUND_WIDGET" && audioSource ? <audio ref={audioRef} src={audioSource} preload="auto" /> : null}
</section>
```

Change: when `isAudioOnlyWidgetType(widget.type)`, skip the positioned `<section>` wrapper entirely. Render:
- `SOUND_WIDGET`: just the bare `<audio ref={audioRef} src={audioSource} preload="auto" />` (no wrapper, no width/height/position styling) when `audioSource` is set, else `null`.
- `TTS_WIDGET`: `null` (TTS playback is already driven separately via socket events in `overlay/page.tsx`, not by this component's body).

All other widget types keep the existing wrapped-`<section>` behavior unchanged.

### 3. Overlay editor canvas — `apps/web/app/overlay/page.tsx`

In the `isEditor` branch of the widgets map (~line 365-432), skip rendering the `<Rnd>` box for audio-only widgets — `return null` for them in editor mode instead of a draggable/resizable empty box. They will not appear on the drag-and-drop canvas at all.

Management of these widgets (settings, delete, enable/disable, overlay binding) continues to happen via the `/dashboard/widgets` list and edit pages, not via right-click-in-canvas. This is an accepted tradeoff — confirmed with the user (recommended option, chosen over showing a small non-resizable marker chip).

Non-editor render path (actual OBS browser source, ~line 434) is unaffected by this section — it already just calls `<WidgetRenderer>`, whose behavior changes per section 2 above.

### 4. Dashboard "Edit Widget" page — `apps/web/app/dashboard/widgets/edit/page.tsx`

The X / Y / Width / Height / Layer `NumberField` row (~line 479-485) is hidden entirely when `isAudioOnlyWidgetType(widget.type)`. Remaining visible in the main form: Widget name, Overlay select, Enable/Disable and Show/Hide buttons.

The Live Preview panel's dimension `Badge` (`{width} x {height}`, ~line 590) is also hidden for audio-only types, since the underlying width/height inputs no longer exist and the panel already substitutes the canvas preview with a "🔊 audio only" notice (~line 592-596, unchanged).

Note: the component still holds `width`/`height`/`positionX`/`positionY` internal state (initialized from the loaded widget) even when hidden, and the "save layout" submit still includes them in the PATCH payload unchanged — this preserves whatever values already exist in the DB for these fields without needing special-case save logic.

### 5. Dashboard "New Widget" page — `apps/web/app/dashboard/widgets/new/page.tsx`

The Width/Height `Field`s (~line 105-112) are hidden reactively based on the currently selected `type` in the dropdown — i.e. toggling the type selector to/from `TTS_WIDGET`/`SOUND_WIDGET` shows/hides the fields immediately, no page reload needed.

Submission (`submit`, ~line 46-64) is unchanged: it still sends whatever `width`/`height` state currently holds (the initial defaults, 420×160, since the fields were never touched) — satisfies the existing non-null DB columns without any special-casing.

## Out of scope

- No changes to `positionX`/`positionY`/`zIndex` semantics or the `visibility` toggle's existing (pre-existing, unrelated) behavior of not actually muting audio playback.
- No changes to the `Widget` Prisma model or any API/DTO validation.
- No changes to other widget types' rendering or editor behavior.
