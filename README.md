# 🎮 EZStream

EZStream คือระบบ Live Stream Widget, Real-time Overlay และ TTS Automation สำหรับ Creator และ Streamer (คล้าย TikFinity หรือ Streamlabs) ให้ครีเอเตอร์สร้าง Overlay/Widget แล้วนำไปแสดงผลใน Browser Source ของ OBS หรือ TikTok LIVE Studio ได้ทันที

ให้บริการทั้งในรูปแบบ **เว็บแอป** และ **Desktop App** (Tauri) ที่รัน API ในตัวเป็น sidecar

---

## ✨ Features

- **Real-time Overlay:** อัปเดตข้อมูลบนหน้าจอ Chat, Goal, Event List และ Alerts แบบทันที ผ่าน Socket.IO
- **Widget System:** รองรับ Widget หลายแบบ — Chat, Alert, TTS, Goal, Event List, Image, Sound, Text
- **Rule Engine:** สร้าง Rule กำหนดเงื่อนไข (Condition tree แบบ AND/OR) และลำดับ Action ที่จะทำงานเมื่อมี Event เข้ามา (เช่น พิมพ์ `!hello` แล้วเล่น Alert + พูด TTS) จัดการได้ที่ `/dashboard/rules` — ครีเอเตอร์ใหม่ที่ยังไม่มี Rule และเปิดใช้ TTS widget จะได้ Rule "อ่านแชท" เริ่มต้นให้อัตโนมัติ
- **Live Chat Sources:** เชื่อมต่อแชทสดจาก TikTok, YouTube และ Twitch โดยตรง (ไม่ผ่าน backend กลาง)
- **TTS:** อ่านออกเสียงได้ทั้งฝั่ง Server (Google Cloud TTS) และฝั่ง Browser (`SpeechSynthesis` บนหน้า Overlay)
- **Media Manager:** อัปโหลดและจัดการไฟล์รูปภาพ/เสียงสำหรับใช้ใน Widget
- **Events Page:** ดูประวัติ Event และผลของ Rule ที่ match ย้อนหลังได้ที่ `/dashboard/events`

---

## 🏗️ Architecture

Monorepo จัดการด้วย `pnpm` workspaces ทุก package เป็น ESM (`moduleResolution: NodeNext`) — relative import ต้องมีนามสกุล `.js` แม้ในไฟล์ `.ts`

- 🖥️ **`apps/web`** — Next.js 15 (App Router, React 19, Tailwind v4) build เป็น **static export** (`output: "export"`) จึงไม่มี server components/route handlers ตอน runtime หน้าใหม่หลักคือ `/dashboard/*` (overlay/widget/rule editor), `/overlay/*` (หน้าที่ OBS render), `/auth/*`
- ⚙️ **`apps/api`** — NestJS backend: REST + JWT auth, `class-validator`, Socket.IO gateway, media upload (multer → `LOCAL_STORAGE_ROOT`, เสิร์ฟที่ `/storage`) แบ่งเป็นโมดูลตามโดเมน (`auth`, `users`, `creators`, `overlays`, `widgets`, `events`, `live-events`, `chat-sources`, `tts`, `media`, `mock-events`, `realtime`, `queues`, `redis`, `audit-logs`, `public`) เมื่อรันเป็น production/desktop, API ยังทำหน้าที่เสิร์ฟ static web export ด้วย (`main.ts` มี middleware fallthrough ไปที่ `WEB_STATIC_ROOT`)
- 🎨 **`apps/desktop`** — Tauri (Rust) shell ที่ห่อ web export ไว้และรัน API เป็น sidecar binary ผ่าน `binaries/node`
- 🗄️ **`packages/db`** — Prisma schema/client/seed (`provider = "sqlite"`, ไม่มีไฟล์ migration ใช้ `prisma db push` แทน)
- 📦 **`packages/shared`** — Types/constants ที่ใช้ร่วมกัน (widget types, TTS voice helper, `sanitizeTtsText`, `conditionOperators` ของ rule engine ฯลฯ)
- 🎨 **`packages/ui`** — UI primitives สไตล์ shadcn (Radix + `class-variance-authority` + `tailwind-merge`)

> **หมายเหตุ:** โปรเจกต์นี้**ไม่ได้ใช้ PostgreSQL, Redis หรือ Docker** ตามที่เอกสารเก่าเคยระบุ ปัจจุบันใช้ **SQLite** (ผ่าน Prisma), **in-memory queue** และ **Redis mock** (in-memory pub/sub ด้วย `EventEmitter`) ทั้งหมดรันแบบ in-process อยู่ภายใน `apps/api` และ**ไม่มี `apps/worker` แยกต่างหาก**

### Event → Overlay flow

1. **Live event** เข้ามา — จาก chat connector จริง (`chat-sources`: TikTok ผ่าน `tiktok-live-connector`, YouTube ผ่าน `youtubei.js`, Twitch ผ่าน `tmi.js`) หรือจากหน้า **Mock Events** สำหรับทดสอบ
2. `LiveEventsService.processEvent` บันทึก event แล้วเรียก `RuleEngineService.evaluate` เพื่อจับคู่กับ Rule ที่ครีเอเตอร์เปิดใช้งาน — Action ประเภท `SPEAK_TTS` จะสร้าง `TtsJob`, Action อื่นสร้าง `WidgetAction`
3. `TtsJob` เข้าคิวที่ **in-process `InMemoryQueue`** ประมวลผลเสร็จแล้ว publish ผ่าน **`MockRedis`** pub/sub
4. **Realtime gateway** (Socket.IO) subscribe channel เหล่านี้แล้ว push ไปยัง client ที่เปิด overlay อยู่
5. **Overlay (web)** รับ event แล้ว render widget (alert, goal, event list, chat) และพูด TTS

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS v4, shadcn/ui (static export)
- **Backend:** NestJS, TypeScript, class-validator, Socket.IO
- **Database:** SQLite (Prisma ORM) — ไม่มี Docker/Postgres
- **Queue/Realtime:** In-memory Queue + Redis mock (in-process, ไม่มี BullMQ หรือ Worker แยก)
- **Desktop:** Tauri (Rust) + Node sidecar binary, NSIS installer, self-update ผ่าน `update.json` บน branch `main`
- **TTS:** Google Cloud Text-to-Speech (server-side) และ Web `SpeechSynthesis` (browser)
- **Chat Connectors:** `tiktok-live-connector`, `youtubei.js`, `tmi.js` (Twitch)

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 22
- Corepack (สำหรับ pnpm 10.11.0): `corepack enable`

ไม่ต้องมี Docker, PostgreSQL หรือ Redis — ฐานข้อมูลเป็น SQLite ไฟล์เดียวและ queue/pub-sub รันในตัว process

### 1. ตั้งค่า Environment

สร้างไฟล์ `.env` ที่ root ของ repo (ดูตัวแปรที่ใช้จริงในหัวข้อ [Configuration](#-configuration)) ค่าที่จำเป็นขั้นต่ำคือ `DATABASE_URL="file:./dev.db"`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `API_PORT`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `LOCAL_STORAGE_ROOT`

### 2. ติดตั้ง Dependencies

```bash
corepack enable
pnpm install
```

### 3. เตรียมฐานข้อมูล

```bash
pnpm db:generate   # prisma generate
pnpm db:migrate    # prisma db push --accept-data-loss
pnpm db:seed       # สร้างบัญชี demo + widgets/rules ตัวอย่าง
```

### 4. รันแอป

```bash
pnpm dev
```

รันทั้ง Web (`:3000`) และ API (`:4000`) พร้อมกัน (queue ประมวลผล in-process อยู่ในตัว API แล้ว)

### Desktop (Tauri)

```bash
pnpm desktop:dev        # desktop:prep + tauri dev (ใช้ web dev server ที่ :3000)
pnpm desktop:dev:all    # รัน web dev และ desktop dev พร้อมกัน
pnpm desktop:build      # build ทั้งหมด + prep + tauri build (สร้าง NSIS installer)
```

`scripts/prepare-desktop.js` (`desktop:prep`) compile/copy API และ workspace deps เข้า `apps/desktop/api-dist` และแก้ `package.json` ให้ชี้ไปที่ `dist/*.js` แทน `src/*.ts` desktop app จะ bundle Node binary (`binaries/node`) เป็น externalBin sidecar เพื่อรัน API และเสิร์ฟ static web export

---

## 🕹️ Demo & Usage Flow

### ทดลองใช้งาน

1. เปิด http://localhost:3000/auth/login
2. เข้าสู่ระบบด้วยบัญชี Demo: `demo@example.com` / `password123`
3. ไปที่เมนู **Overlays** แล้วคัดลอก URL ของ Overlay ที่มีอยู่
4. ไปที่เมนู **Mock Events** แล้วลองจำลอง event เช่น `chat`, `gift`, `follow`
5. ดูผลลัพธ์แบบ real-time บน Overlay (Alert ขึ้น, TTS พูด, Goal อัปเดต) และดูประวัติที่เมนู **Events**

### นำไปใช้ใน OBS หรือ TikTok LIVE Studio

```text
http://localhost:3000/overlay/{overlayToken}
```

1. เพิ่ม Source ใหม่ เลือก **Browser**
2. นำ URL ไปวาง แล้วกำหนดขนาด (เช่น `1920x1080`)
3. แนะนำให้ติ๊กเปิด **"Control audio via OBS"** เพื่อควบคุมเสียง Alert/TTS ผ่าน Audio Mixer ของ OBS

---

## ⚙️ Configuration

ตัวแปร environment ทั้งหมดอยู่ในไฟล์ `.env` ที่ root เดียว (api/web dev script โหลดผ่าน `dotenv -e ../../.env`):

| ตัวแปร | คำอธิบาย |
| --- | --- |
| `DATABASE_URL` | Path ไฟล์ SQLite เช่น `file:./dev.db` |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | ใช้เซ็น JWT |
| `API_PORT` / `API_CORS_ORIGIN` | Port และ CORS origin ของ API |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL` | URL ที่ web ใช้เรียก API และ Socket.IO |
| `LOCAL_STORAGE_ROOT` | โฟลเดอร์เก็บไฟล์ media ที่อัปโหลด |
| `GOOGLE_APPLICATION_CREDENTIALS` + `GOOGLE_TTS_*` | Credential และค่า config ของ Google Cloud TTS (server-side) |
| `TIKTOK_SIGN_API_KEY` | (Optional) API key จาก eulerstream.com เพื่อลด rate limit ตอนเชื่อมต่อ TikTok |
| `WORKER_CONCURRENCY` | จำนวน job ที่ประมวลผลพร้อมกันใน in-memory queue |

---

## 🧑‍💻 Development Guide

### Commands

```bash
pnpm build       # pnpm -r build ทุก package
pnpm typecheck   # pnpm -r typecheck
pnpm lint        # ส่วนใหญ่คือ tsc --noEmit เหมือน typecheck ยกเว้น apps/web ที่ใช้ next lint
```

รันเฉพาะ package ได้ด้วย `pnpm --filter @ezstream/api dev`, `pnpm --filter @ezstream/web build` เป็นต้น

> ยังไม่มี unit test framework ผูกไว้ในโปรเจกต์ — อย่าสมมติว่ามีคำสั่ง `pnpm test`

### Troubleshooting

- **หาคำสั่ง `pnpm` ไม่เจอ:** ตรวจสอบว่ารัน `corepack enable` แล้ว
- **API 401 Unauthorized:** Token หมดอายุ ให้ออกจากระบบแล้วเข้าสู่ระบบใหม่
- **TTS (เสียงอ่าน) ไม่ทำงานบน Overlay:** Browser บังคับให้ต้องมีการโต้ตอบ (interaction) หรืออนุญาต autoplay audio ก่อนเสียงจึงจะเล่นได้

---
*Built for creators. Empowering live streams.* 🚀
