# Audio-Only Widget Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `TTS_WIDGET` and `SOUND_WIDGET` skip all position/size layout — no box on the overlay, no draggable box in the Overlay Editor canvas, no X/Y/Width/Height/Layer controls in the dashboard — leaving only the Overlay-binding dropdown as meaningful for these two types.

**Architecture:** Add one small shared predicate (`isAudioOnlyWidgetType`) in `apps/web/lib/widget-types.ts` and thread it through the four existing render/UI sites that currently treat every widget type uniformly: the overlay's `WidgetRenderer`, the Overlay Editor's draggable canvas, and the two dashboard widget forms (New/Edit). No backend, Prisma, or DTO changes — `Widget.width/height/positionX/positionY` stay required columns for other widget types; this is purely conditional UI/rendering logic.

**Tech Stack:** Next.js 15 (App Router, static export), React 19, TypeScript. No unit-test framework is wired up in this repo (see `CLAUDE.md`) — verification here is `pnpm --filter @ezstream/web typecheck` per task plus a full manual browser walkthrough in the final task, per project convention for frontend changes.

## Global Constraints

- Relative imports must include the `.js`-free `.tsx`/`.ts` source form but resolve via NodeNext — for `.ts` **files under `apps/web`** (Next.js, not compiled the same way as `apps/api`), follow the existing sibling-file import style already used in this codebase (no `.js` extension on imports within `apps/web`, e.g. `import { API_URL } from "../lib/api"`) — match whatever the file you're editing already does, don't introduce a new convention.
- No `pnpm test` — do not add one. Verification is `pnpm --filter @ezstream/web typecheck` (and `pnpm --filter @ezstream/web lint` if touched files are lint-covered) plus manual browser verification.
- Widget types affected: exactly `TTS_WIDGET` and `SOUND_WIDGET`. No other widget type's behavior changes.
- Thai UI copy already used in this codebase should be matched in tone if any new user-facing string is added (none are required by this plan — no new strings are introduced, only conditional hiding of existing UI).
- Do not touch `packages/db/prisma/schema.prisma` or any API/NestJS code — this plan is 100% within `apps/web`.

---

### Task 1: Shared `isAudioOnlyWidgetType` helper

**Files:**
- Create: `apps/web/lib/widget-types.ts`

**Interfaces:**
- Produces: `AUDIO_ONLY_WIDGET_TYPES: readonly string[]` and `isAudioOnlyWidgetType(type: string): boolean`, both imported by Tasks 2-5.

- [ ] **Step 1: Create the helper file**

```ts
// apps/web/lib/widget-types.ts
export const AUDIO_ONLY_WIDGET_TYPES = ["TTS_WIDGET", "SOUND_WIDGET"] as const;

export function isAudioOnlyWidgetType(type: string): boolean {
  return (AUDIO_ONLY_WIDGET_TYPES as readonly string[]).includes(type);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @ezstream/web typecheck`
Expected: passes with no errors (new file has no consumers yet, so this just confirms the file itself is valid TypeScript).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/widget-types.ts
git commit -m "feat(web): add isAudioOnlyWidgetType helper"
```

---

### Task 2: Overlay renderer skips the positioned box for audio-only widgets

**Files:**
- Modify: `apps/web/components/widget-renderer.tsx`

**Interfaces:**
- Consumes: `isAudioOnlyWidgetType(type: string): boolean` from Task 1 (`apps/web/lib/widget-types.ts`).
- Produces: no new exports; `WidgetRenderer`'s rendered output changes for `TTS_WIDGET`/`SOUND_WIDGET` only.

**Context:** `WidgetRenderer` (around line 185-243 today) always wraps its `body` in `<section className="absolute overflow-hidden rounded-none text-white" style={style}>`, where `style` sets `left/top/width/height/zIndex` from the widget. For `TTS_WIDGET` the `body` is already `null`; for `SOUND_WIDGET` the `body` is already `null` too, with a bare `<audio>` element appended after it inside the same `<section>`. The `<section>` wrapper itself is the box that needs to disappear for these two types — the `<audio>` element should still render (unwrapped) so playback keeps working.

- [ ] **Step 1: Add the import**

At the top of `apps/web/components/widget-renderer.tsx`, alongside the existing `import { API_URL } from "../lib/api";` (line 7), add:

```ts
import { isAudioOnlyWidgetType } from "../lib/widget-types";
```

- [ ] **Step 2: Replace the final return of `WidgetRenderer`**

Find (near the end of the `WidgetRenderer` component, currently lines 237-242):

```tsx
  return (
    <section className="absolute overflow-hidden rounded-none text-white" style={style}>
      {body}
      {widget.type === "SOUND_WIDGET" && audioSource ? <audio ref={audioRef} src={audioSource} preload="auto" /> : null}
    </section>
  );
});
```

Replace with:

```tsx
  if (isAudioOnlyWidgetType(widget.type)) {
    return widget.type === "SOUND_WIDGET" && audioSource ? (
      <audio ref={audioRef} src={audioSource} preload="auto" />
    ) : null;
  }

  return (
    <section className="absolute overflow-hidden rounded-none text-white" style={style}>
      {body}
    </section>
  );
});
```

Note: this removes the `SOUND_WIDGET` conditional from inside the `<section>` (no longer needed there since that branch now returns before reaching the `<section>`), and the `<section>` branch no longer needs the inline audio check at all.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @ezstream/web typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Manual sanity check**

Run: `pnpm --filter @ezstream/web dev` (or `pnpm dev` from repo root), then open `http://localhost:3000/overlay/{overlayToken}` for a demo overlay that has a `SOUND_WIDGET` or `TTS_WIDGET` attached (seed data or one created via the dashboard). Open browser DevTools → Elements and confirm there is **no** `<section>` element for that widget's id-bearing entry (i.e. no absolutely-positioned empty box in the DOM at the widget's old X/Y coordinates) — for `SOUND_WIDGET`, confirm a bare `<audio>` tag exists instead. Leave the dev server running for later tasks' manual checks if convenient, or stop it — either is fine.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/widget-renderer.tsx
git commit -m "fix(web): audio-only widgets no longer render a positioned overlay box"
```

---

### Task 3: Overlay Editor canvas skips the draggable box for audio-only widgets

**Files:**
- Modify: `apps/web/app/overlay/page.tsx`

**Interfaces:**
- Consumes: `isAudioOnlyWidgetType(type: string): boolean` from Task 1 (`apps/web/lib/widget-types.ts`).
- Produces: no new exports; in `isEditor` mode, `TTS_WIDGET`/`SOUND_WIDGET` widgets no longer render any `<Rnd>` box, so they're no longer draggable/resizable/right-clickable in the Overlay Editor canvas (`/dashboard/overlays/edit`'s embedded iframe).

**Context:** The widgets map (currently starting at line 364) branches on `isEditor`. When true, every widget — including audio-only ones — gets wrapped in a draggable/resizable `<Rnd>` box (lines 365-432) with drag/resize handlers that `postMessage` position/size updates to the parent dashboard page. For audio-only widgets this box is empty (nothing visually inside it) and dragging/resizing it is meaningless. Per product decision, these widgets should not appear in the editor canvas at all — they're managed from `/dashboard/widgets` instead.

- [ ] **Step 1: Add the import**

At the top of `apps/web/app/overlay/page.tsx`, alongside the existing `import { API_URL, resolveAssetUrl } from "../../lib/api";` (line 8), add:

```ts
import { isAudioOnlyWidgetType } from "../../lib/widget-types";
```

- [ ] **Step 2: Skip the `<Rnd>` branch for audio-only widgets**

Find (currently lines 364-366):

```tsx
      {state?.widgets.map((widget) => {
        if (isEditor) {
          return (
```

Replace with:

```tsx
      {state?.widgets.map((widget) => {
        if (isEditor) {
          if (isAudioOnlyWidgetType(widget.type)) return null;
          return (
```

Leave everything else in that `<Rnd>...</Rnd>` block (lines ~367-432) and the trailing `return <WidgetRenderer key={widget.id} widget={widget} chatMessages={chatMessages} />;` (non-editor path) unchanged — the non-editor path already produces correct output via Task 2's change to `WidgetRenderer`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @ezstream/web typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Manual sanity check**

With the dev server running (`pnpm dev`), open `/dashboard/overlays/edit?id={overlayId}` for an overlay that has both a visual widget (e.g. an `ALERT_WIDGET` or `TEXT_WIDGET`) and an audio-only widget (`SOUND_WIDGET` or `TTS_WIDGET`) attached. Confirm: the visual widget still shows its draggable/resizable box and can be dragged/resized as before; the audio-only widget shows **no** box anywhere on the canvas and there is nothing to right-click for it there.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/overlay/page.tsx
git commit -m "fix(web): hide audio-only widgets from the Overlay Editor canvas"
```

---

### Task 4: Dashboard "Edit Widget" page hides position/size controls for audio-only widgets

**Files:**
- Modify: `apps/web/app/dashboard/widgets/edit/page.tsx`

**Interfaces:**
- Consumes: `isAudioOnlyWidgetType(type: string): boolean` from Task 1 (`apps/web/lib/widget-types.ts`).
- Produces: no new exports; the X/Y/Width/Height/Layer `NumberField` row and the Live Preview dimension `Badge` are hidden when the loaded widget is audio-only. The existing "audio only, no visual preview" notice (already conditional, ~line 592-596) is switched to use the shared helper instead of its inline type check, for consistency.

**Context:** This page keeps local React state (`positionX`, `positionY`, `width`, `height`, `zIndex`) seeded from the loaded widget and always renders a 5-column `NumberField` row for them (currently lines 479-485), plus a `Badge` showing `{width} x {height}` in the Live Preview panel (currently line 590). Both should disappear for audio-only widgets — the underlying state variables are left untouched (still loaded, still sent on save) so no other logic in this file needs to change.

- [ ] **Step 1: Add the import**

Near the other local imports at the top of the file (alongside `import { NumberField } from "../../../../components/widget-settings/fields";`), add:

```ts
import { isAudioOnlyWidgetType } from "../../../../lib/widget-types";
```

- [ ] **Step 2: Wrap the X/Y/Width/Height/Layer row in a conditional**

Find (currently lines 479-485):

```tsx
              <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 xl:grid-cols-5">
                <NumberField disabled={busy || !widget} label="X" onChange={setPositionX} value={positionX} />
                <NumberField disabled={busy || !widget} label="Y" onChange={setPositionY} value={positionY} />
                <NumberField disabled={busy || !widget} label="ความกว้าง (Width)" min={1} max={widget?.overlay?.width ?? 1920} onChange={setWidth} value={width} />
                <NumberField disabled={busy || !widget} label="ความสูง (Height)" min={1} max={widget?.overlay?.height ?? 1080} onChange={setHeight} value={height} />
                <NumberField disabled={busy || !widget} label="Layer" onChange={setZIndex} value={zIndex} />
              </div>
```

Replace with:

```tsx
              {widget && isAudioOnlyWidgetType(widget.type) ? null : (
                <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 xl:grid-cols-5">
                  <NumberField disabled={busy || !widget} label="X" onChange={setPositionX} value={positionX} />
                  <NumberField disabled={busy || !widget} label="Y" onChange={setPositionY} value={positionY} />
                  <NumberField disabled={busy || !widget} label="ความกว้าง (Width)" min={1} max={widget?.overlay?.width ?? 1920} onChange={setWidth} value={width} />
                  <NumberField disabled={busy || !widget} label="ความสูง (Height)" min={1} max={widget?.overlay?.height ?? 1080} onChange={setHeight} value={height} />
                  <NumberField disabled={busy || !widget} label="Layer" onChange={setZIndex} value={zIndex} />
                </div>
              )}
```

(Condition is `widget && isAudioOnlyWidgetType(...)` rather than `isAudioOnlyWidgetType(widget?.type ?? "")` so that while `widget` is still loading — briefly `undefined` — the fields render as before, matching prior loading-state behavior where they were always present just `disabled`.)

- [ ] **Step 3: Hide the dimension Badge and reuse the shared helper for the preview notice**

Find (currently lines 583-601):

```tsx
        <aside className="sticky top-28 z-20 self-start xl:top-32">
          <ResourceCard>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-white">Live Preview</p>
                <p className="mt-1 text-xs font-medium text-ink-subtle">อัปเดตทันทีระหว่างปรับค่า</p>
              </div>
              <Badge tone="info">{Math.max(1, Number(width) || 0)} x {Math.max(1, Number(height) || 0)}</Badge>
            </div>
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
          </ResourceCard>
        </aside>
```

Replace with:

```tsx
        <aside className="sticky top-28 z-20 self-start xl:top-32">
          <ResourceCard>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-white">Live Preview</p>
                <p className="mt-1 text-xs font-medium text-ink-subtle">อัปเดตทันทีระหว่างปรับค่า</p>
              </div>
              {widget && isAudioOnlyWidgetType(widget.type) ? null : (
                <Badge tone="info">{Math.max(1, Number(width) || 0)} x {Math.max(1, Number(height) || 0)}</Badge>
              )}
            </div>
            {widget && isAudioOnlyWidgetType(widget.type) ? (
              <div className="border-2 border-dashed border-border-base bg-surface-dark p-6 text-center">
                <p className="text-sm font-semibold text-white">🔊 Widget เสียง — ไม่มีภาพบนสตรีม</p>
                <p className="mt-1 text-xs text-ink-subtle">widget นี้เล่นเสียงอย่างเดียว จะไม่แสดงอะไรบน Overlay/OBS</p>
              </div>
            ) : (
              <ScalableWidgetPreview width={Number(width) || 400} height={Number(height) || 160}>
                {deferredPreviewWidget ? <WidgetRenderer widget={deferredPreviewWidget} chatMessages={isChatWidget ? deferredChatMessages : []} /> : null}
              </ScalableWidgetPreview>
            )}
          </ResourceCard>
        </aside>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @ezstream/web typecheck`
Expected: passes with no errors.

- [ ] **Step 5: Manual sanity check**

With the dev server running, open `/dashboard/widgets/edit?id={id}` for a `SOUND_WIDGET` (or `TTS_WIDGET`) and confirm: no X/Y/Width/Height/Layer row appears; no dimension badge appears above the Live Preview; the "🔊 Widget เสียง" notice still appears as before; the Overlay dropdown, name field, and Enable/Disable + Show/Hide buttons are all still present and functional. Then open the edit page for a visual widget (e.g. `TEXT_WIDGET`) and confirm the X/Y/Width/Height/Layer row and dimension badge still appear exactly as before (no regression for non-audio types).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dashboard/widgets/edit/page.tsx
git commit -m "feat(web): hide position/size controls for audio-only widgets in Edit Widget page"
```

---

### Task 5: Dashboard "New Widget" page hides Width/Height fields reactively for audio-only types

**Files:**
- Modify: `apps/web/app/dashboard/widgets/new/page.tsx`

**Interfaces:**
- Consumes: `isAudioOnlyWidgetType(type: string): boolean` from Task 1 (`apps/web/lib/widget-types.ts`).
- Produces: no new exports; the Width/Height `Field`s are hidden whenever the currently-selected `type` dropdown value is `TTS_WIDGET` or `SOUND_WIDGET`, and shown otherwise. `submit()` is unchanged — it still sends the (untouched, default 420×160) `width`/`height` state values regardless, satisfying the non-null DB columns.

**Context:** Unlike the Edit page, this page has no widget loaded yet — `type` is plain component state driven by the `<Select>` at (currently) lines 97-103, defaulting to `"CHAT_WIDGET"`. The Width/Height fields (currently lines 105-112) should hide/show immediately as the user changes the type dropdown, before any submission happens.

- [ ] **Step 1: Add the import**

Near the other local imports at the top of the file (alongside `import { useUnsavedChangesWarning } from "../../../../lib/use-unsaved-changes-warning";`), add:

```ts
import { isAudioOnlyWidgetType } from "../../../../lib/widget-types";
```

- [ ] **Step 2: Wrap the Width/Height fields in a conditional**

Find (currently lines 105-112):

```tsx
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="กว้าง">
              <Input min={1} onChange={(event) => setWidth(Number(event.target.value))} type="number" value={width} />
            </Field>
            <Field label="สูง">
              <Input min={1} onChange={(event) => setHeight(Number(event.target.value))} type="number" value={height} />
            </Field>
          </div>
```

Replace with:

```tsx
          {isAudioOnlyWidgetType(type) ? null : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="กว้าง">
                <Input min={1} onChange={(event) => setWidth(Number(event.target.value))} type="number" value={width} />
              </Field>
              <Field label="สูง">
                <Input min={1} onChange={(event) => setHeight(Number(event.target.value))} type="number" value={height} />
              </Field>
            </div>
          )}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @ezstream/web typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Manual sanity check**

With the dev server running, open `/dashboard/widgets/new`, leave the default type (`CHAT_WIDGET`) and confirm the Width/Height fields are visible. Change the "ประเภท" dropdown to `SOUND_WIDGET` (or `TTS_WIDGET`) and confirm the Width/Height fields disappear immediately (no page reload). Change it back to any visual type (e.g. `IMAGE_WIDGET`) and confirm they reappear. Submit a new `SOUND_WIDGET` and confirm creation succeeds and lands on its Edit page (which, per Task 4, should show no position/size row).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/widgets/new/page.tsx
git commit -m "feat(web): hide Width/Height fields for audio-only widget types in New Widget page"
```

---

### Task 6: Full manual verification pass

**Files:** none (verification only).

**Interfaces:** none — this task exercises the combined behavior of Tasks 1-5 end to end.

- [ ] **Step 1: Start the full dev stack**

Run: `pnpm dev` from the repo root (runs web on `:3000` and api on `:4000` concurrently). Ensure `pnpm db:migrate` and `pnpm db:seed` have been run at least once so demo data exists (login `demo@example.com` / `password123`).

- [ ] **Step 2: Create-flow check**

Go to `/dashboard/widgets/new`. Create one `SOUND_WIDGET` and one `TTS_WIDGET`, both bound to an existing overlay via the Overlay dropdown. Confirm the Width/Height fields were hidden for both while creating them (per Task 5), and both save successfully.

- [ ] **Step 3: Edit-flow check**

Open each newly created widget's Edit page. Confirm neither shows the X/Y/Width/Height/Layer row nor the dimension badge (per Task 4), both still show the Overlay dropdown with the correct overlay selected, and both still show their type-specific settings panel (`SoundWidgetSettings` / `TtsWidgetSettings`) unaffected.

- [ ] **Step 4: Overlay Editor canvas check**

Open `/dashboard/overlays/edit?id={overlayId}` for the overlay both widgets are bound to. Confirm neither audio-only widget shows a draggable box on the canvas (per Task 3), while any other visual widget on that same overlay still does.

- [ ] **Step 5: Live overlay render check**

Open the plain overlay URL `http://localhost:3000/overlay/{overlayToken}` (no `?editor=true`) in a new tab. Open DevTools → Elements. Confirm there is no absolutely-positioned empty `<section>` for either audio-only widget (per Task 2). For the `SOUND_WIDGET`, if it has a media file configured, trigger it (e.g. via `/dashboard/mock-events` or however sound triggers are tested in this repo) and confirm audio still plays correctly despite the wrapper removal.

- [ ] **Step 6: Full workspace typecheck**

Run: `pnpm typecheck` (repo root, runs across all packages)
Expected: passes with no errors.

- [ ] **Step 7: Report results**

Summarize pass/fail for Steps 2-6 back to the user. If any step fails, stop and fix before considering the feature complete — do not report success without having actually run these checks (per project convention: "if you can't test the UI, say so explicitly rather than claiming success").
