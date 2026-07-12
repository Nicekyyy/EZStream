# Design: หน้า "อีเวนต์" (Events tab)

Date: 2026-07-13

## Goal

Add a new dashboard page at `/dashboard/events` that shows a **real-time, detailed
log of non-chat live events** (gift, follow, like, share, subscribe, viewer-joined).
Chat messages already have their own page (`/dashboard/chat`) and are excluded here.

Features requested:

- Real-time updates via Socket.IO (not polling).
- Type filter chips (all / gift / follow / like / share / subscribe / join).
- Test-send buttons that fire mock events through the real rule engine.
- A "matched" badge showing when an event triggered one or more rules, plus an
  expandable raw JSON payload view.

## Backend

### 1. `RealtimeGateway` — authenticated creator room

Add a `creator.join` `@SubscribeMessage` handler:

- The dashboard connects with `io(url, { auth: { token } })` where `token` is the
  `ezstream_token` JWT from `localStorage`.
- The handler reads the token from `socket.handshake.auth.token`, verifies it with
  `JwtService.verifyAsync`, then looks up `user → creator.id` via Prisma (same logic
  as `JwtAuthGuard`).
- On success, `socket.join(\`creator:${creatorId}\`)` and return `{ joined: true }`.
- On missing/invalid token or no creator, return `{ joined: false }` (no throw).

`JwtService` is available for injection because `AuthModule` is `@Global()` and
exports `JwtModule` — no changes to `realtime.module.ts` are required. `PrismaService`
is already injected in the gateway.

### 2. `LiveEventsService.handleEvent` — publish complete event

After rule evaluation completes (so `matchedRuleIds` and final `status` are known),
publish a new `event.logged` message to room `creator:${creatorId}` carrying the
**complete serialized event**:

```
{ id, eventType, payload, status, matchedRuleIds, createdAt }
```

This matches the shape of `GET /events` list items so the frontend renders live and
historical rows through the same code path. The existing `event.received` publish
(fired before evaluation) is left untouched.

## Frontend

### Nav

Add `["/dashboard/events", "อีเวนต์"]` to `navItems` in
`apps/web/app/dashboard/layout.tsx`, placed after "แชท".

### `/dashboard/events/page.tsx`

- **Load:** `GET /events` on mount, drop `live.chat.message` rows.
- **Realtime:** open a Socket.IO connection with `auth: { token }`, emit `creator.join`,
  listen for `event.logged` → prepend (dedupe by `id`, cap ~200 rows).
- **Filters:** chip row (ทั้งหมด / ของขวัญ / ติดตาม / ไลก์ / แชร์ / ซับสไครบ์ / เข้าห้อง),
  client-side filter on `eventType`.
- **Test buttons:** `POST /mock-events/{gift,follow,like,share,subscribe,join}`. Each
  round-trips through the engine and returns via `event.logged`.
- **Row (the "detailed" part):** per-type icon + Thai label, displayName/username,
  avatar when present, and type-specific detail:
  - gift → `giftName ×repeatCount` + coins
  - like → `likeCount`
  - others → username only
  Plus a relative timestamp, a "match" badge when `matchedRuleIds.length > 0`, and an
  expand toggle revealing the raw JSON `payload`.

Reuses `DashboardShell`, `ResourceCard`, existing icons, and the Thai/Tailwind
conventions already in the codebase.

## Event types & payload fields (reference)

| eventType                | fields available                                              |
|--------------------------|--------------------------------------------------------------|
| live.gift.received       | username, displayName, avatarUrl, giftName, giftId, repeatCount, coins |
| live.follow.received     | username, displayName, avatarUrl                             |
| live.like.received       | username, displayName, likeCount, totalLikeCount            |
| live.share.received      | username, displayName                                        |
| live.subscribe.received  | username, displayName                                        |
| live.viewer.joined       | username, displayName                                        |

## Out of scope (YAGNI)

- Deleting / clearing event history.
- Server-side pagination beyond the existing 100-row `GET /events` limit.
- Chat events (covered by `/dashboard/chat`).
