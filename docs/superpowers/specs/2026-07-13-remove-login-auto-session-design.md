# Design: Auto-login เบื้องหลัง (ลบหน้า login)

วันที่: 2026-07-13

## เป้าหมาย

ผู้ใช้ EZStream ต้องเข้าใช้งานได้ทันทีโดยไม่ต้องเจอหน้า login/register
เก็บระบบ auth ฝั่ง API (JWT + bcrypt + guard) ไว้ครบ แต่ทำให้ผู้ใช้
ไม่ต้องยืนยันตัวตนด้วยตัวเอง — เว็บจะ login ให้อัตโนมัติเบื้องหลัง

มีผลกับทั้งเว็บและเดสก์ท็อป (Tauri) เพราะเดสก์ท็อปเสิร์ฟ web export ตัวเดียวกัน

## แนวทางที่เลือก: Auto-login เบื้องหลัง (B)

ฝั่ง API **ไม่แก้อะไรเลย** — `JwtAuthGuard`, endpoint `/auth/login`,
`/auth/register`, `/auth/me` และ bcrypt ยังทำงานเหมือนเดิม
งานทั้งหมดอยู่ฝั่งเว็บ

### บัญชี default

ใช้บัญชีเดียวคงที่ hardcode ในโค้ดเว็บ:

- email: `demo@example.com`
- password: `password123`

(เป็นบัญชีเดียวกับที่ `pnpm db:seed` สร้าง)

## องค์ประกอบ

### 1. `apps/web/lib/api.ts` — จุดทำงานหลัก

เพิ่มฟังก์ชัน `ensureSession()`:

1. ถ้ามี token ใน localStorage แล้ว → คืนค่าเลย
2. ถ้ายังไม่มี → `POST /auth/login` ด้วยบัญชี default
3. ถ้า login ไม่ผ่าน (เช่น database ใหม่ยังไม่ seed จึงยังไม่มีบัญชีนี้)
   → `POST /auth/register` สร้างบัญชี default แล้วเก็บ token
4. เก็บ token ผ่าน `setToken()`

แก้ `api()`:

- เรียก `await ensureSession()` ก่อนยิงคำขอทุกครั้ง (เพื่อให้มี token เสมอ)
- ถ้า response เป็น **401** → ล้าง token, เรียก `ensureSession()` ใหม่,
  แล้ว retry คำขอเดิม **1 ครั้ง** ป้องกันลูปไม่รู้จบ
- ถ้ายังพลาดอีก → โยน error ตามปกติ

จุดสำคัญเรื่อง concurrency: dashboard ยิงหลายคำขอพร้อมกัน (`Promise.all`)
`ensureSession()` ต้องกันไม่ให้ login ซ้ำหลายรอบ — เก็บ promise ที่กำลังทำงาน
ไว้ใน module-scope แล้วให้ทุก caller รอ promise เดียวกัน

### 2. ลบ UI auth ฝั่งเว็บ

- ลบ `apps/web/app/auth/login/page.tsx`
- ลบ `apps/web/app/auth/register/page.tsx`
- ลบโฟลเดอร์ `apps/web/app/auth/` ถ้าว่าง
- ตรวจและลบลิงก์/ปุ่มที่ชี้ไป `/auth/*` ถ้ามีในหน้าอื่น

### 3. ฝั่ง API

ไม่แก้ไข endpoint `/auth/*` ยังคงอยู่และถูกเรียกโดย auto-login

## Data flow

```
เปิด dashboard
  → api("/auth/me") ถูกเรียก
    → ensureSession(): ไม่มี token → POST /auth/login (default)
        สำเร็จ → เก็บ token
        ล้มเหลว → POST /auth/register (default) → เก็บ token
    → ยิง /auth/me พร้อม Bearer token
      → 200 → แสดง dashboard
      → 401 → ล้าง token, ensureSession() ใหม่, retry 1 ครั้ง
```

## Error handling

- auto-login ล้มเหลวจริง (เช่น API ยังไม่ตื่น / ต่อ database ไม่ได้)
  → โยน error ปกติ หน้าจอแสดงข้อความ error เดิมของแต่ละหน้า
  (พฤติกรรมเดียวกับตอน API ล่มในปัจจุบัน)
- ป้องกันลูป retry ด้วยการ retry แค่ 1 ครั้งต่อคำขอ

## การทดสอบ (manual — โปรเจกต์ไม่มี unit test framework)

1. `pnpm db:seed && pnpm dev`
2. เปิดเบราว์เซอร์ ล้าง localStorage แล้วเข้า `http://localhost:3000/dashboard`
   → ต้องเข้าได้เลยโดยไม่เจอหน้า login
3. ทดสอบ database ใหม่: ลบ token + ทดสอบเส้นทาง register อัตโนมัติ
   (หรือรันบน database ที่ยังไม่ seed) → ต้องสร้างบัญชีและเข้าได้
4. ทดสอบ token หมดอายุ: set token ปลอมใน localStorage → เข้า dashboard
   → ต้อง auto-login ใหม่และใช้งานได้ (ไม่ค้างที่ error 401)
5. เข้า `/auth/login` โดยตรง → ต้องได้ 404 (หน้าถูกลบ)

## ข้อควรทราบ / ข้อจำกัด

- ทุกคนที่เปิดเว็บจะใช้ **บัญชีเดียวกัน** และเห็นข้อมูลชุดเดียวกัน
  (overlay, widget, rule) — เหมาะกับการใช้งานส่วนตัว/เครื่องเดียว
  ตามที่ตกลงไว้ ไม่เหมาะกับ deploy สาธารณะแบบ multi-user
- ระบบ auth ฝั่ง API ยังอยู่ครบ ถ้าอนาคตต้องการเปิด login กลับมา
  แค่คืนหน้า UI และเอา auto-login ออก
