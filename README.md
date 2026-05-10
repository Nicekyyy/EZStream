# EZStream

EZStream คือระบบ Live Stream Widget, Real-time Overlay และ TTS Automation สำหรับ Creator/Streamer คล้าย TikFinity ในขอบเขต MVP ที่ไม่มี donation, payment, checkout, transaction, PromptPay, payment webhook หรือ subscription billing

## Architecture

- `apps/web`: Next.js dashboard, overlay และ overlay preview
- `apps/api`: NestJS REST API, JWT auth, Socket.IO gateway, Rule Engine, media upload
- `apps/worker`: BullMQ workers สำหรับ `live-events`, `widget-actions`, `tts-jobs`
- `packages/db`: Prisma schema, Prisma client และ seed data
- `packages/shared`: shared constants/types สำหรับ widget/rule/event contracts
- `packages/ui`: shadcn-style UI primitives

Flow หลัก:

1. Creator login แล้วสร้าง overlay, widget และ rule
2. Mock live event ถูกส่งเข้า API
3. API บันทึก `EventLog`, match `Rule`, สร้าง `WidgetAction`/`TtsJob` และ enqueue BullMQ
4. Worker process jobs, อัปเดต `WidgetState`/job status และ publish realtime events
5. Overlay page รับ Socket.IO events และ sync state จาก `/public/overlay/:token/state`
6. TTS MVP พูดผ่าน browser `SpeechSynthesis` ใน overlay

## Tech Stack

- Monorepo: pnpm workspace
- Frontend: Next.js, TypeScript, Tailwind CSS, shadcn-style components
- Backend: NestJS, TypeScript, class-validator
- Database: PostgreSQL, Prisma
- Realtime: Socket.IO, Redis adapter, Redis pub/sub
- Queue: BullMQ, Redis
- Storage MVP: local file storage
- Local infra: Docker Compose

## Requirements

- Node.js 22 LTS หรือใหม่กว่า
- Corepack/pnpm
- Docker Desktop

เครื่องนี้ใช้ host ports `55432` และ `56379` เพราะมี PostgreSQL/Redis อื่นจับ `5432/6379` อยู่แล้ว

## Environment Variables

คัดลอกไฟล์ตัวอย่าง:

```powershell
Copy-Item .env.example .env
```

ค่าหลัก:

- `DATABASE_URL=postgresql://ezstream:ezstream@localhost:55432/ezstream?schema=public`
- `REDIS_URL=redis://localhost:56379`
- `JWT_SECRET=replace-with-a-secure-random-secret`
- `NEXT_PUBLIC_API_URL=http://localhost:4000`
- `NEXT_PUBLIC_SOCKET_URL=http://localhost:4000`
- `API_CORS_ORIGIN=http://localhost:3000`
- `LOCAL_STORAGE_ROOT=./storage`

## Local Setup

```powershell
corepack enable
pnpm install
Copy-Item .env.example .env
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

URLs:

- Web: http://localhost:3000
- API: http://localhost:4000
- PostgreSQL: localhost:55432
- Redis: localhost:56379

## Database Migration และ Seed

```powershell
pnpm db:migrate
pnpm db:seed
```

Demo account:

- Email: `demo@example.com`
- Password: `password123`

Seed สร้าง:

- Creator: `demo_creator`
- Overlay: `Main Overlay` ขนาด `1920x1080`
- Widgets: Chat Alert, TTS, Goal, Event List, Sound, Text
- Rules:
  - `live.chat.message` contains `!hello` -> alert, TTS, event list
  - `live.gift.received` giftName equals `Rose` -> goal, sound, alert, event list
  - `live.follow.received` -> alert, event list

## Run Apps

```powershell
pnpm dev
```

คำสั่งนี้รันพร้อมกัน:

- `@ezstream/web` ที่ port `3000`
- `@ezstream/api` ที่ port `4000`
- `@ezstream/worker`

## Demo Flow

1. เปิด http://localhost:3000/auth/login
2. Login ด้วย demo account
3. ไปที่ `Overlays` แล้ว copy overlay URL
4. เปิด overlay preview ที่ `/overlay/preview/demo_overlay_token_phase2`
5. ไปที่ `Mock Events`
6. กด `chat`, `gift`, `follow`
7. Overlay จะรับ realtime events, alert แสดง, TTS พูดผ่าน browser, goal update, event list update

## Add Overlay to OBS / TikTok LIVE Studio

ใช้ URL รูปแบบนี้:

```text
http://localhost:3000/overlay/{overlayToken}
```

ใน OBS:

1. Add Source -> Browser
2. ใส่ URL overlay
3. ตั้ง width/height เป็น `1920x1080`
4. เปิด `Control audio via OBS` ตามการใช้งานเสียงของเครื่อง

## Create Widget

1. Login
2. ไปที่ `Dashboard -> Widgets`
3. กด `สร้าง Widget`
4. เลือก overlay และ widget type
5. กดบันทึก

Widget renderer รองรับ:

- `ALERT_WIDGET`
- `TTS_WIDGET`
- `GOAL_WIDGET`
- `EVENT_LIST_WIDGET`
- `CHAT_WIDGET`
- `IMAGE_WIDGET`
- `SOUND_WIDGET`
- `TEXT_WIDGET`

ทุก widget ใช้ `positionX`, `positionY`, `width`, `height`, `zIndex`, `visibility`, `config`

## Create Rule

ไปที่ `Dashboard -> Rules` แล้วสร้าง rule พื้นฐานจากฟอร์ม หรือเรียก API โดยตรง:

```json
{
  "eventType": "live.chat.message",
  "conditions": [{ "field": "message", "operator": "contains", "value": "!hello" }],
  "actions": [
    { "type": "SHOW_ALERT", "widgetId": "..." },
    { "type": "SPEAK_TTS", "widgetId": "...", "textTemplate": "{username} said {message}" }
  ]
}
```

Operators ที่รองรับ: `equals`, `notEquals`, `contains`, `notContains`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `exists`, `in`

## Test Mock Event

ใน dashboard ใช้หน้า `Mock Events` หรือเรียก API:

```powershell
curl -X POST http://localhost:4000/mock-events/chat `
  -H "Authorization: Bearer <token>" `
  -H "Content-Type: application/json" `
  -d "{\"username\":\"viewer\",\"message\":\"!hello\"}"
```

## TTS

Worker สร้าง payload:

```json
{
  "type": "tts.speak",
  "text": "Hello world",
  "voice": "default",
  "speed": 1,
  "pitch": 1,
  "volume": 1
}
```

Overlay รับ `tts.speak` ผ่าน Socket.IO แล้วเรียก browser `SpeechSynthesis`

## Media Upload

หน้า `Dashboard -> Media` ใช้ `/media/upload` และ local storage

รองรับ:

- `image/png`
- `image/jpeg`
- `image/webp`
- `audio/mpeg`
- `audio/wav`
- `audio/ogg`

มี validation file type, file size, owner creator และ path traversal protection

## Troubleshooting

- ถ้า `pnpm` ไม่พบ: รัน `corepack enable` หรือเรียก pnpm shim จาก Corepack ตามเครื่อง
- ถ้า port ชน: ตรวจ `docker ps` และ `netstat -ano`; โปรเจกต์นี้ตั้ง PostgreSQL `55432`, Redis `56379`
- ถ้า API 401: login ใหม่และใช้ Bearer token ล่าสุด
- ถ้า overlay ไม่ขยับ: ตรวจว่า `apps/api` และ `apps/worker` รันอยู่ และ Redis container healthy
- ถ้า TTS ไม่พูด: browser ต้องอนุญาต audio/autoplay และ overlay page ต้องเปิดอยู่
- ถ้า upload ไม่ผ่าน: ตรวจ MIME type และขนาดไม่เกิน 10MB
