# Rule Engine — Design Spec

**Date:** 2026-07-10
**Status:** Approved

## Goal

Build the rule engine that README/PRODUCT.md have long advertised but was never implemented. Creators define automation rules — "when event X matching conditions Y happens, run actions Z" — replacing the single hardcoded automation (every chat message → TTS) with a user-controllable system. Includes wiring real TikTok events (gift/follow/like/share/subscribe) into the pipeline, since today only chat messages arrive from real platforms.

## Scope

**In scope**

- Full-featured rules: nested AND/OR condition groups, per-rule cooldown (rule-wide or per-user), random action groups, daily active-time window, priority ordering, stop-on-match.
- Multiple actions per rule, with `{variable}` template rendering in action text.
- Migrate the hardcoded chat→TTS automation into a seeded default rule; delete the hardcode.
- Wire TikTok gift/follow/like/share/subscribe events from `tiktok-live-connector` into `processEvent`.
- Dashboard UI: rule list + full rule editor with condition builder, action editor, and dry-run test.
- Overlay renderer support for the new action events (alert, sound, image, text, goal).
- Vitest for the pure evaluator logic (first test framework in the repo, scoped to `apps/api`).

**Out of scope (later)**

- YouTube/Twitch non-chat events (super chat, membership, sub, raid, cheer).
- Rule import/export, rule templates gallery.
- Analytics on rule firing.

## 1. Data model

New Prisma model `Rule` (SQLite, `prisma db push`):

```prisma
model Rule {
  id              String    @id @default(cuid())
  creatorId       String
  name            String
  isEnabled       Boolean   @default(true)
  priority        Int       @default(0)      // lower evaluates first
  stopOnMatch     Boolean   @default(false)  // if matched, skip remaining rules
  eventTypes      Json      // string[] e.g. ["live.gift.received"]
  conditions      Json      // condition tree, see below
  actions         Json      // action array, see below
  cooldownSeconds Int       @default(0)
  cooldownScope   String    @default("rule") // "rule" | "user"
  activeFrom      String?   // "HH:mm" daily window start (local time); null = always
  activeTo        String?   // "HH:mm" daily window end
  lastFiredAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  creator Creator @relation(fields: [creatorId], references: [id], onDelete: Cascade)

  @@index([creatorId])
}
```

`EventLog.matchedRuleIds` (existing, always `"[]"` today) starts being written with the JSON array of matched rule ids. `EventStatus.MATCHED` is used when ≥1 rule matched.

### Condition tree

Recursive JSON. A node is either a group (`all` = AND, `any` = OR) or a leaf condition. Groups nest arbitrarily. An empty tree (`{"all": []}`) matches everything.

```json
{ "all": [
  { "field": "giftName", "operator": "equals", "value": "Rose" },
  { "any": [
    { "field": "repeatCount", "operator": "greaterThanOrEqual", "value": 5 },
    { "field": "coins", "operator": "greaterThanOrEqual", "value": 100 }
  ]}
]}
```

- `field` is a dot-path into the event payload (same resolution as the existing `getPathValue` in `live-events.service.ts`).
- `operator` is one of the existing `conditionOperators` from `@ezstream/shared`: `equals`, `notEquals`, `contains`, `notContains`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `exists`, `in`.
- String comparisons are case-insensitive for `equals`/`contains` variants; numeric operators coerce numeric strings.

### Actions array

Ordered list; each entry is an action object. Types reuse `ruleActionTypes` from `@ezstream/shared` plus a new `RANDOM` group type:

```json
[
  { "type": "SHOW_ALERT",  "widgetId": "…", "textTemplate": "ขอบคุณ {displayName}!", "durationMs": 5000 },
  { "type": "SPEAK_TTS",   "widgetId": "…", "textTemplate": "{displayName}: {message}" },
  { "type": "PLAY_SOUND",  "widgetId": "…", "mediaAssetId": "…" },
  { "type": "SHOW_IMAGE",  "widgetId": "…", "mediaAssetId": "…", "durationMs": 5000 },
  { "type": "UPDATE_TEXT", "widgetId": "…", "textTemplate": "ล่าสุด: {displayName}" },
  { "type": "UPDATE_GOAL", "widgetId": "…", "incrementBy": "{coins}" },
  { "type": "APPEND_EVENT_LIST", "widgetId": "…", "textTemplate": "{displayName} ส่ง {giftName}" },
  { "type": "RANDOM", "pick": 1, "actions": [ /* non-RANDOM actions */ ] }
]
```

- `textTemplate` / `incrementBy` render `{dot.path}` variables via the existing `renderTemplate` helper (moved to a shared location).
- `UPDATE_GOAL.incrementBy` accepts a number or a template resolving to a number; non-numeric result → increment 1.
- `RANDOM` picks `pick` (default 1) actions uniformly from its children; one level only (no nested RANDOM).

## 2. Backend — new module `apps/api/src/rules/`

Follows the one-module-per-domain pattern. ESM: relative imports use `.js` extensions.

- **`rules.module.ts`** — imports Prisma/Queues/Redis providers as other modules do; exports `RuleEngineService` for `live-events`.
- **`rules.controller.ts`** — JWT-guarded CRUD scoped to the caller's creator:
  - `GET /rules`, `POST /rules`, `GET /rules/:id`, `PATCH /rules/:id`, `DELETE /rules/:id`
  - `POST /rules/:id/test` — dry run: body `{ eventType, payload }`; returns match result plus a per-node condition trace (each leaf: field, resolved value, operator, expected, pass/fail). No actions executed, no cooldown consumed.
- **`rules.service.ts`** — CRUD + validation:
  - condition tree: known operators only, groups are `all`/`any` arrays, depth cap (8) to prevent pathological trees;
  - actions: known types, referenced `widgetId`/`mediaAssetId` must belong to the creator, widget type must be compatible with the action type (e.g. `SPEAK_TTS` → `TTS_WIDGET`);
  - invalidates the engine's rule cache on any write.
- **`rule-evaluator.ts`** — pure functions, no Nest/Prisma imports (unit-testable): `evaluateConditions(tree, payload)`, `evaluateConditionsWithTrace(...)`, operator implementations, template rendering.
- **`rule-engine.service.ts`** — orchestration:
  1. Load enabled rules for the creator (per-creator in-memory cache; invalidated on rule writes), sorted by `priority` then `createdAt`.
  2. Filter by `eventTypes` containing the incoming event type.
  3. Skip if outside `activeFrom`/`activeTo` (handles overnight windows like 22:00–02:00).
  4. Skip if cooling down: in-memory `Map` keyed `ruleId` (scope `rule`) or `ruleId:username` (scope `user`); `lastFiredAt` from DB seeds the rule-scope check after restart.
  5. Evaluate conditions via `rule-evaluator`.
  6. On match: execute actions, update `lastFiredAt`, record rule id; if `stopOnMatch`, stop.
  7. Each rule evaluated inside try/catch — one broken rule logs to `EventLog.errorMessage` and never blocks the event or other rules.

**Action execution reuses existing plumbing:**

- `SPEAK_TTS` — creates a `TtsJob` and enqueues `tts.speak`, same as today's `createTtsJob` (that logic moves from `LiveEventsService` into the rules module, including command-prefix skip, banned-words filter, and max-length from widget config).
- All other actions — create a `WidgetAction` row (existing model, currently unused) and publish `widget.trigger` with `{ actionType, ...renderedPayload }` to rooms `widget:{id}` and `overlay-token:{token}` via the existing MockRedis pub/sub, mirroring `publishWidget`.

**`LiveEventsService.processEvent` changes:** replace the `if (eventType === "live.chat.message")` hardcode with `await this.ruleEngine.evaluate(creatorId, eventType, payload, eventLog.id)`; persist returned `matchedRuleIds`; set status `MATCHED` when non-empty, else `PROCESSED`.

## 3. TikTok real events

In `chat-connector.service.ts`, add `tiktok-live-connector` listeners alongside the existing chat listener:

| Connector event | `processEvent` type | Key payload fields |
|---|---|---|
| `gift` | `live.gift.received` | `giftName`, `giftId`, `repeatCount`, `coins` (diamond value × count), `username`, `displayName`, `avatarUrl` |
| `follow` | `live.follow.received` | `username`, `displayName`, `avatarUrl` |
| `like` | `live.like.received` | `likeCount`, `totalLikeCount`, `username`, `displayName` |
| `share` | `live.share.received` | `username`, `displayName` |
| `subscribe` | `live.subscribe.received` | `username`, `displayName` |

All payloads also carry `platform: "tiktok"`, `overlayId`, `overlayToken` (same as chat today). Event type names match what `mock-events` already emits, so mock buttons exercise the same rules.

**Gift streaks:** fire only when the streak completes (`repeatEnd === true`) or the gift is non-streakable (`giftType !== 1`), with the final `repeatCount`. Set `enableExtendedGiftInfo: true` on the connection so diamond values are available for `coins`.

Mock events controller gains a `subscribe` button to match.

## 4. Frontend

### `/dashboard/rules` (list)

Table/cards: name, trigger summary ("Gift · 2 เงื่อนไข · 3 actions"), enabled toggle (inline PATCH), edit / duplicate / delete. Empty state links to the editor.

### `/dashboard/rules/edit?id=…` (editor)

Static-export-safe (query param, not dynamic route — matches existing `/dashboard/widgets/edit` pattern). Sections:

1. **Basics** — name, enabled, priority, stopOnMatch.
2. **Trigger** — multi-select of event types (chat / gift / follow / like / share / subscribe).
3. **Conditions** — recursive group builder: ALL/ANY toggle per group, condition rows (field select + operator select + value input), add-condition / add-group / remove. Field dropdown is populated per selected event types (e.g. gift → `giftName`, `coins`, `repeatCount`; chat → `message`, `username`, `displayName`) with a free-form custom-path option. Value input adapts (text / number / comma list for `in`).
4. **Actions** — ordered list; add action → pick type → widget picker filtered to compatible widget types → type-specific fields (text template with a variable-hint helper listing available `{fields}`, media asset picker for sound/image, duration, goal increment). RANDOM group renders as a bordered sub-list with a `pick` count.
5. **Timing** — cooldown seconds + scope (rule/user), optional active window (from/to time inputs).
6. **Test panel** — pick a sample event type, edit a prefilled JSON payload, run dry-run; render the condition trace (pass/fail per leaf) and matched/unmatched result.

### Overlay renderer

`apps/web/components/widget-renderer.tsx` subscribes to the new `widget.trigger` socket event and handles per widget type:

- `SHOW_ALERT` → alert widget plays its show animation with rendered text for `durationMs`.
- `PLAY_SOUND` → sound widget plays the media asset URL (respect browser autoplay constraints, same as TTS today).
- `SHOW_IMAGE` → image widget shows the asset for `durationMs`.
- `UPDATE_TEXT` → text widget swaps its content.
- `UPDATE_GOAL` → goal widget increments current value (also persisted server-side into `WidgetState` so reloads keep progress).
- `APPEND_EVENT_LIST` → event list widget prepends an entry.

## 5. Migration & seed

- Delete `createDefaultChatTtsJob` and move the TTS job-creation logic into the rules module.
- **Boot migration:** on API startup, for every creator with zero rules and ≥1 enabled `TTS_WIDGET`, create a default enabled rule "อ่านแชทเป็นเสียง (TTS)": trigger `live.chat.message`, empty conditions, single `SPEAK_TTS` action targeting the first enabled TTS widget with template `{displayName}: {message}` (or `{message}` when the widget config sets `includeSenderName: false`). Existing desktop users update the app and behavior is unchanged — but now visible and editable.
- Seed script creates the same default rule plus one example gift rule for the demo account.
- Update README.md / PRODUCT.md / CLAUDE.md to remove the "no rule engine" caveats once shipped.

## 6. Error handling

- Rule CRUD validation rejects malformed trees/actions with 400s and clear messages.
- Engine: per-rule try/catch; failures append to `EventLog.errorMessage`, event still completes.
- Template variables resolving to `undefined` render as empty string (existing behavior).
- Cooldown map is bounded (per-user entries pruned when > 10k or older than the cooldown period) to avoid unbounded memory during long lives.

## 7. Testing

- **Vitest** added to `apps/api` (`pnpm --filter @ezstream/api test`) covering `rule-evaluator.ts`: every operator, nested all/any trees, depth cap, template rendering, trace output, RANDOM selection bounds. First test framework in the repo.
- End-to-end verification: dashboard mock-event buttons → rule fires → overlay reacts; TikTok wiring verified against a live room where feasible.
- `pnpm typecheck` and `pnpm build` must pass across the monorepo.
