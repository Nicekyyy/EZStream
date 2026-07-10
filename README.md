# 🎮 EZStream

EZStream คือระบบ Live Stream Widget, Real-time Overlay และ TTS Automation สำหรับ Creator และ Streamer (คล้าย TikFinity หรือ Streamlabs) ออกแบบมาเพื่อให้ครีเอเตอร์สามารถจัดการ Overlay และการโต้ตอบกับผู้ชมได้อย่างง่ายดาย

> **Note:** ปัจจุบันโปรเจกต์อยู่ในระยะ MVP ซึ่งเน้นการทำงานพื้นฐานของ Overlay และ Automation (ยังไม่มีระบบ Donation, Payment, หรือ Subscription ในตอนนี้)

เป้าหมายระยะยาวของโปรเจกต์คือการพัฒนาไปสู่ **Desktop Application** (เช่น Electron, Tauri, หรือ Neutralinojs) เพื่อให้สตรีมเมอร์สามารถใช้งานได้สะดวกที่สุด

---

## ✨ Features

- **Real-time Overlay:** อัปเดตข้อมูลบนหน้าจอแชท, Goal, Event List และ Alerts ได้ทันที
- **Widget System:** รองรับ Widgets หลากหลายรูปแบบ (Chat, Alert, TTS, Goal, Event List, Image, Sound, Text)
- **Chat-to-TTS Automation:** ข้อความแชทที่เข้ามาจะถูกอ่านออกเสียงอัตโนมัติผ่าน TTS Widget ตัวแรกที่เปิดใช้งานในแต่ละ Overlay (ยังไม่มี Rule Engine ที่ปรับแต่งเงื่อนไขเองได้ — อยู่ในแผนพัฒนาถัดไป)
- **TTS Integration:** ระบบอ่านข้อความ (Text-to-Speech) ผ่าน Browser API โดยตรงบน Overlay
- **Media Manager:** ระบบอัปโหลดและจัดการไฟล์รูปภาพและเสียงสำหรับใช้ใน Widgets

---

## 🏗️ Architecture

โปรเจกต์นี้เป็น **Monorepo** จัดการด้วย `pnpm` workspaces 

- 🖥️ **`apps/web`**: หน้า Dashboard (Next.js), ระบบจัดการ Overlay และหน้า Overlay Preview สำหรับแสดงผลใน OBS
- ⚙️ **`apps/api`**: Backend Service (NestJS) จัดการ REST API, JWT Authentication, Chat-to-TTS Automation, การอัปโหลด Media และ Socket.IO Gateway
- 👷 **`apps/worker`**: Background Workers (NestJS + BullMQ) สำหรับจัดการ Queue งานหนัก เช่น `live-events`, `widget-actions`, และ `tts-jobs`
- 🗄️ **`packages/db`**: จัดการ Database Schema และ Client ด้วย Prisma
- 📦 **`packages/shared`**: เก็บ Types และ Constants ที่ใช้ร่วมกันทั้ง Frontend และ Backend
- 🎨 **`packages/ui`**: UI Components พื้นฐาน (Shadcn UI style)

---

## 🛠️ Tech Stack

- **Frontend:** Next.js, React, Tailwind CSS, shadcn/ui
- **Backend:** NestJS, TypeScript, class-validator
- **Database:** PostgreSQL (Prisma ORM)
- **Realtime & Queue:** Socket.IO, Redis, BullMQ
- **Infrastructure:** Docker Compose (สำหรับการพัฒนาในเครื่อง Local)

---

## 🚀 Getting Started

### Prerequisites

- Node.js 22 LTS หรือใหม่กว่า
- Corepack (เพื่อใช้ pnpm)
- Docker Desktop (สำหรับรันฐานข้อมูล)

> **Important:** โปรเจกต์นี้ใช้ Port `55432` สำหรับ PostgreSQL และ `56379` สำหรับ Redis เพื่อหลีกเลี่ยงการชนกับ Service อื่นในเครื่องของคุณ

### 1. Environment Setup

สร้างไฟล์ `.env` จาก template:

```bash
# คัดลอกไฟล์ .env.example เป็น .env
cp .env.example .env
# หรือบน Windows PowerShell: Copy-Item .env.example .env
```

### 2. Install & Start Infra

```bash
# เปิดใช้งาน corepack และติดตั้ง dependencies
corepack enable
pnpm install

# รัน Database และ Redis ผ่าน Docker
docker compose up -d
```

### 3. Database Migration & Seed

รันคำสั่งเหล่านี้เพื่อสร้างตารางและข้อมูลจำลองสำหรับทดสอบ (Demo Account, Widgets พื้นฐาน, Rules):

```bash
pnpm db:migrate
pnpm db:seed
```

### 4. Run the Apps

```bash
pnpm dev
```

คำสั่งนี้จะรันทั้ง Web (Port 3000), API (Port 4000) และ Worker พร้อมกัน!

---

## 🕹️ Demo & Usage Flow

### ทดลองใช้งาน
1. เปิด http://localhost:3000/auth/login
2. เข้าสู่ระบบด้วยบัญชี Demo:
   - Email: `demo@example.com`
   - Password: `password123`
3. ไปที่เมนู **Overlays** แล้วคัดลอก URL ของ Overlay ที่มีอยู่
4. ไปที่เมนู **Mock Events** 
5. ลองจำลองเหตุการณ์ เช่น `chat`, `gift`, `follow` 
6. ดูผลลัพธ์แบบ Real-time บน Overlay (Alert ขึ้น, TTS พูด, Goal อัปเดต)

### การนำไปใช้ใน OBS หรือ TikTok LIVE Studio

ใช้ URL รูปแบบด้านล่างนำไปใส่ใน Browser Source:

```text
http://localhost:3000/overlay/{overlayToken}
```

**ขั้นตอนใน OBS:**
1. เพิ่ม Source ใหม่ เลือก **Browser**
2. นำ URL ไปวาง
3. กำหนดความกว้างและความสูง (เช่น `1920x1080`)
4. แนะนำให้ติ๊กเปิด **"Control audio via OBS"** เพื่อให้ควบคุมเสียงแจ้งเตือนและ TTS ได้ผ่าน Audio Mixer ของ OBS

---

## 🧑‍💻 Development Guide

### การทำงานของ System Flow (โดยย่อ)

1. **Creator** สร้าง Overlay และวาง Widget ใน Dashboard
2. เมื่อมี **Live Event** เข้ามา (เช่น แชท, ของขวัญ, follow) API จะรับ Event นั้นและบันทึกลง `EventLog`
3. ปัจจุบันมีแค่ Chat-to-TTS Automation แบบอัตโนมัติ: ข้อความแชทจะสร้าง `TtsJob` ส่งเข้า Queue ให้ TTS Widget ตัวแรกที่เปิดใช้งาน (ยังไม่มี Rule Engine ที่กำหนดเงื่อนไขเองได้ — Event ประเภทอื่นเช่นของขวัญ/follow ยังไม่ trigger Widget ใด ๆ)
4. **Worker** รับงานจาก Queue มาประมวลผล แล้ว Publish ผ่าน Redis
5. **API (Socket Gateway)** ส่งข้อมูลให้ Client
6. **Overlay (Web)** รับ Socket Event และแสดงผล Widget / เล่นเสียง TTS ทันที

### Troubleshooting

- **หาคำสั่ง `pnpm` ไม่เจอ:** ตรวจสอบว่ารัน `corepack enable` แล้ว หรือติดตั้ง pnpm ไว้ในเครื่อง
- **API 401 Unauthorized:** Token อาจจะหมดอายุ ให้ออกจากระบบแล้วเข้าสู่ระบบใหม่
- **TTS (เสียงอ่าน) ไม่ทำงาน:** Browser บังคับให้หน้าเว็บต้องมีการโต้ตอบ (Interact) หรืออนุญาต Autoplay Audio ก่อน เสียงจึงจะดัง 

---
*Built for creators. Empowering live streams.* 🚀
