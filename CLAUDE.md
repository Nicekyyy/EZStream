# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

EZStream is a live-stream overlay / widget / TTS-automation platform for creators (similar to TikFinity / Streamlabs). It ships both as a web app and as a bundled desktop app (Tauri). A creator builds overlays and widgets and renders the result in a browser source (OBS / TikTok LIVE Studio).

> **No rule engine exists.** README.md, PRODUCT.md, and earlier versions of this file describe a "Rule Engine" that lets creators define custom automation conditions. That feature was never built: there is no `Rule` model in the Prisma schema (only a vestigial, always-empty `EventLog.matchedRuleIds` column) and no rule-management UI. The only automation that actually runs is hardcoded in `live-events.service.ts`: every `live.chat.message` event auto-creates a TTS job from the creator's first enabled `TTS_WIDGET`. Gift/follow/like/share events are logged but trigger no widget action.

> **The README is partly out of date.** It describes PostgreSQL + Redis + Docker + a separate `apps/worker`. The current code uses **SQLite** (Prisma), an **in-memory queue and Redis mock** (no external services), and there is **no worker app** — queue processing runs in-process inside the API. Trust the code over the README.

## Commands

Run from the repo root. Requires Node >= 22 and pnpm 10.11.0 (`corepack enable`).

```bash
pnpm install
pnpm db:generate        # prisma generate
pnpm db:migrate         # prisma db push --accept-data-loss (schema -> SQLite, no migration files)
pnpm db:seed            # seeds demo account + widgets/rules
pnpm dev                # runs web (:3000) and api (:4000) concurrently
pnpm build              # pnpm -r build across all packages
pnpm typecheck          # pnpm -r typecheck
pnpm lint               # pnpm -r lint
```

Per-package: `pnpm --filter @ezstream/api dev`, `pnpm --filter @ezstream/web build`, etc.

**Note on lint/typecheck:** most packages' `lint` script is just `tsc --noEmit` (same as `typecheck`); only `apps/web` uses `next lint`. There is no unit-test framework wired up — do not assume `pnpm test` exists.

Demo login (after seed): `demo@example.com` / `password123`. Overlay browser-source URL: `http://localhost:3000/overlay/{overlayToken}`.

### Desktop (Tauri)

```bash
pnpm desktop:dev        # desktop:prep + tauri dev (uses web devUrl :3000)
pnpm desktop:dev:all    # web dev + desktop dev together
pnpm desktop:build      # full build: pnpm build + prep + tauri build (NSIS installer)
```

`scripts/prepare-desktop.js` (`desktop:prep`) compiles/copies the API and its workspace deps into `apps/desktop/api-dist`, rewriting `package.json` `main`/`exports` from `./src/*.ts` to `./dist/*.js`. The desktop app bundles a Node binary (`binaries/node`) as an `externalBin` sidecar to run the API, and serves the statically exported web (`apps/web/out`). The Tauri updater reads `update.json` from the GitHub `main` branch.

## Architecture

pnpm monorepo (`apps/*`, `packages/*`). Everything is **ESM** (`"type": "module"`, `moduleResolution: NodeNext`) — **relative imports must include the `.js` extension** even in `.ts` source (e.g. `import { X } from "./x.js"`). Path aliases `@ezstream/{db,shared,ui}` resolve to each package's `src/index.ts` (see `tsconfig.base.json`).

- **`apps/api`** — NestJS backend. REST + JWT auth (`@nestjs/jwt`), `class-validator` global `ValidationPipe`, Socket.IO gateway, media upload (multer → `LOCAL_STORAGE_ROOT`, served at `/storage`). One module per domain: `auth`, `users`, `creators`, `overlays`, `widgets`, `events`, `live-events`, `chat-sources`, `tts`, `media`, `mock-events`, `realtime`, `queues`, `redis`, `audit-logs`, `public`. In production/desktop the API **also serves the static web export** — `main.ts` has middleware that falls through non-API GET requests to `WEB_STATIC_ROOT` (`apps/web/out`).
- **`apps/web`** — Next.js 15 (App Router, React 19, Tailwind v4). Configured for **static export** (`output: "export"`), so no server components / route handlers at runtime. Key routes: `/dashboard/*` (overlay + widget editors), `/overlay/*` (the OBS-facing renderer), `/auth/*`. Talks to the API via `NEXT_PUBLIC_API_URL` and Socket.IO via `NEXT_PUBLIC_SOCKET_URL`. Also imports `@tauri-apps/*` for desktop-only features (updater, process).
- **`apps/desktop`** — Tauri (Rust) shell that wraps the web export and runs the bundled API sidecar. See Desktop section above.
- **`packages/db`** — Prisma schema + client + seed. `provider = "sqlite"`, `DATABASE_URL="file:./dev.db"`. Migrations use `prisma db push` (no migration history). Exports the client and enums via `src/index.ts`.
- **`packages/shared`** — cross-cutting types/constants (widget types, TTS voice helpers, `sanitizeTtsText`, etc.). Also exports a `conditionOperators` constant for the never-implemented rule engine — unused by any consumer today. Consumed by both api and web.
- **`packages/ui`** — shadcn-style primitives (Radix + `class-variance-authority` + `tailwind-merge`).

### Event → overlay flow

1. A **live event** arrives — either from a real chat connector or from `mock-events` (dashboard testing).
2. `chat-sources` connects directly to platforms in-process: **TikTok** (`tiktok-live-connector`), **YouTube** (`youtubei.js`), **Twitch** (`tmi.js`). `TIKTOK_SIGN_API_KEY` (eulerstream) is optional to bypass rate limits.
3. `LiveEventsService.processEvent` logs the event and, **only for `live.chat.message`**, hardcodes a `TtsJob` from the creator's first enabled `TTS_WIDGET` (see the no-rule-engine note above). Other event types are logged only.
4. The `TtsJob` goes onto the **queue** (`queues/queues.service.ts`). This is an **in-process `InMemoryQueue`**, not BullMQ. Processing publishes results via the **`MockRedis`** pub/sub (`redis/redis.module.ts`), an in-memory `EventEmitter` bus — no real Redis is required or connected.
5. The **realtime** Socket.IO gateway subscribes to those channels and pushes events to connected overlay clients.
6. The **overlay** web page renders the widget (alert, goal, event list, chat) and speaks TTS.

### TTS

Two paths: server-side **Google Cloud Text-to-Speech** (needs `GOOGLE_APPLICATION_CREDENTIALS` + `GOOGLE_TTS_*` env vars; audio signed/generated in `queues.service.ts`) and browser `SpeechSynthesis` on the overlay. Browser TTS/audio requires a user interaction or autoplay permission before it will play.

## Configuration

Single root `.env` (loaded by api/web dev scripts via `dotenv -e ../../.env`). Notable vars: `DATABASE_URL` (SQLite file), `JWT_SECRET`/`JWT_EXPIRES_IN`, `API_PORT` (4000), `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SOCKET_URL`, `LOCAL_STORAGE_ROOT` (media upload dir), `GOOGLE_APPLICATION_CREDENTIALS` + `GOOGLE_TTS_*`, `TIKTOK_SIGN_API_KEY`, `WORKER_CONCURRENCY`.
