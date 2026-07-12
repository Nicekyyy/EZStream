# Auto-login เบื้องหลัง (ลบหน้า login) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ใช้ EZStream เข้าใช้งานได้ทันทีโดยไม่ต้องเจอหน้า login/register — เว็บ login ให้อัตโนมัติเบื้องหลังด้วยบัญชี default

**Architecture:** เก็บระบบ auth ฝั่ง API (JWT + bcrypt + `JwtAuthGuard` + `/auth/*` endpoints) ไว้ครบ ไม่แก้เลย งานทั้งหมดอยู่ฝั่งเว็บใน `apps/web/lib/api.ts`: เพิ่ม `ensureSession()` ที่ login/register บัญชี default อัตโนมัติ, เรียกก่อนทุกคำขอ, และ retry เมื่อเจอ 401 จากนั้นลบหน้า UI `/auth/*`

**Tech Stack:** Next.js 15 (App Router, static export), TypeScript ESM, fetch API, localStorage

## Global Constraints

- ESM: relative imports ในโค้ด `.ts`/`.tsx` ต้องไม่ใส่ `.js` extension สำหรับ path alias — แต่ import ภายใน `apps/web` ใช้ relative path แบบ Next.js ปกติ (ไม่ต้องมี `.js`) ตามที่ไฟล์เดิมทำ (เช่น `from "../../lib/api"`)
- ไม่มี unit-test framework — ตรวจงานด้วย `pnpm --filter @ezstream/web typecheck` และการทดสอบด้วยมือบนเบราว์เซอร์
- บัญชี default คงที่: email `demo@example.com`, password `password123`
- ฝั่ง API (`apps/api`) **ห้ามแก้ไข** — endpoint `/auth/login`, `/auth/register`, `/auth/me` และ guard ต้องคงเดิม
- commit message ภาษาอังกฤษ ลงท้ายด้วย `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

- **Modify** `apps/web/lib/api.ts` — เพิ่ม `ensureSession()`, ค่าคงที่บัญชี default, `clearToken()`, และแก้ `api()` ให้ ensure session + retry 401
- **Delete** `apps/web/app/auth/login/page.tsx`
- **Delete** `apps/web/app/auth/register/page.tsx`
- **Delete** โฟลเดอร์ `apps/web/app/auth/` (หลังไฟล์ข้างในถูกลบหมด)

---

### Task 1: เพิ่ม auto-login ใน `apps/web/lib/api.ts`

**Files:**
- Modify: `apps/web/lib/api.ts`

**Interfaces:**
- Consumes: มีอยู่แล้วในไฟล์ — `getToken(): string | null`, `setToken(token: string): void`, ค่าคงที่ `API_URL`
- Produces:
  - `clearToken(): void` — ลบ token ออกจาก localStorage
  - `ensureSession(): Promise<string>` — คืน token ที่ใช้งานได้ (login หรือ register บัญชี default ถ้ายังไม่มี token) กันเรียกซ้ำด้วย in-flight promise เดียว
  - `api<T>(path, init)` — พฤติกรรมใหม่: เรียก `ensureSession()` ก่อน, retry 1 ครั้งเมื่อ 401

- [ ] **Step 1: อ่านไฟล์ปัจจุบันเพื่อยืนยันบริบท**

Run: อ่าน `apps/web/lib/api.ts` ทั้งไฟล์ (ปัจจุบันมี `getToken`, `setToken`, `api`, `resolveAssetUrl`, export `API_URL`, `APP_URL`)

- [ ] **Step 2: เพิ่มค่าคงที่บัญชี default และ `clearToken` หลัง `setToken`**

เพิ่มโค้ดนี้ต่อจากฟังก์ชัน `setToken` (หลังบรรทัด `}` ปิดของ `setToken`):

```typescript
export function clearToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("ezstream_token");
}

const DEFAULT_ACCOUNT = {
  email: "demo@example.com",
  password: "password123"
};

// กัน login/register ซ้ำเมื่อหลายคำขอยิงพร้อมกัน (เช่น Promise.all บน dashboard)
let sessionPromise: Promise<string> | null = null;

async function requestToken(path: string): Promise<string> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(DEFAULT_ACCOUNT)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const data = (await response.json()) as { accessToken: string };
  return data.accessToken;
}

export function ensureSession(): Promise<string> {
  const existing = getToken();
  if (existing) return Promise.resolve(existing);

  if (!sessionPromise) {
    sessionPromise = (async () => {
      let token: string;
      try {
        // บัญชี default มีอยู่แล้ว (จาก seed) — login ปกติ
        token = await requestToken("/auth/login");
      } catch {
        // database ใหม่ยังไม่ seed — สร้างบัญชี default ให้อัตโนมัติ
        token = await requestToken("/auth/register");
      }
      setToken(token);
      return token;
    })().finally(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}
```

- [ ] **Step 3: แก้ฟังก์ชัน `api()` ให้ ensure session ก่อนยิง และ retry เมื่อ 401**

แทนที่ฟังก์ชัน `api` เดิมทั้งฟังก์ชันด้วย:

```typescript
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  async function send(token: string): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type") && init.body && !(init.body instanceof FormData)) {
      headers.set("content-type", "application/json");
    }
    headers.set("authorization", `Bearer ${token}`);
    return fetch(`${API_URL}${path}`, { ...init, headers });
  }

  let token = await ensureSession();
  let response = await send(token);

  // token หมดอายุ/ไม่ถูกต้อง — ล้างแล้ว login ใหม่ retry 1 ครั้ง
  if (response.status === 401) {
    clearToken();
    token = await ensureSession();
    response = await send(token);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `คำขอไม่สำเร็จ (${response.status})`);
  }
  return (await response.json()) as T;
}
```

- [ ] **Step 4: typecheck**

Run: `pnpm --filter @ezstream/web typecheck`
Expected: PASS (ไม่มี error) — หมายเหตุ: `setToken`/`api` ที่ถูก import ในหน้า `/auth/*` ที่กำลังจะลบยังอยู่ ยังไม่กระทบ typecheck

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api.ts
git commit -m "feat(web): auto-login default account behind the scenes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: ลบหน้า UI `/auth/login` และ `/auth/register`

**Files:**
- Delete: `apps/web/app/auth/login/page.tsx`
- Delete: `apps/web/app/auth/register/page.tsx`
- Delete: โฟลเดอร์ `apps/web/app/auth/` (เมื่อว่าง)

**Interfaces:**
- Consumes: `api`, `setToken` จาก `apps/web/lib/api.ts` (หน้าเหล่านี้เคยใช้ — ลบทิ้งพร้อมกัน)
- Produces: (ไม่มี — เป็นการลบ)

- [ ] **Step 1: ยืนยันว่าไม่มีหน้าอื่นลิงก์ไป `/auth/*`**

Run: `grep -rn "/auth/login\|/auth/register" apps/web/app apps/web/components 2>/dev/null | grep -v "app/auth/"`
Expected: ไม่มีผลลัพธ์ (เฉพาะไฟล์ใน `app/auth/` เองที่อ้างถึง ซึ่งกำลังจะถูกลบ)

- [ ] **Step 2: ลบไฟล์ทั้งสองและโฟลเดอร์ auth**

```bash
git rm apps/web/app/auth/login/page.tsx apps/web/app/auth/register/page.tsx
rmdir apps/web/app/auth/login apps/web/app/auth/register apps/web/app/auth 2>/dev/null || true
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @ezstream/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/app/auth
git commit -m "feat(web): remove login and register pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: ทดสอบด้วยมือ (manual verification)

**Files:** (ไม่มีการแก้ไฟล์ — เป็นการตรวจงานปลายทาง)

**Interfaces:**
- Consumes: การเปลี่ยนแปลงจาก Task 1 และ Task 2

- [ ] **Step 1: เตรียม database และรันแอป**

```bash
pnpm db:seed
pnpm dev
```
Expected: web ขึ้นที่ `:3000`, api ที่ `:4000`

- [ ] **Step 2: ทดสอบเข้า dashboard โดยไม่มี token**

ในเบราว์เซอร์: เปิด DevTools → Application → Local Storage → ลบ key `ezstream_token` (หรือใช้ incognito) → เปิด `http://localhost:3000/dashboard`
Expected: เข้า dashboard ได้ทันที เห็นข้อมูล overlay/widget โดย**ไม่**ถูกพาไปหน้า login

- [ ] **Step 3: ทดสอบเส้นทาง register อัตโนมัติ (database ใหม่)**

หยุด `pnpm dev`, ลบไฟล์ database แล้ว push schema ใหม่ (ไม่ seed):
```bash
rm packages/db/dev.db
pnpm db:migrate
pnpm dev
```
เปิด `http://localhost:3000/dashboard` ด้วย localStorage ที่ล้างแล้ว
Expected: เข้าได้ — auto-login ล้มเหลวที่ login แล้วไป register สร้างบัญชี default อัตโนมัติ (ตรวจ Network tab: เห็น `/auth/login` 401 ตามด้วย `/auth/register` 201)

- [ ] **Step 4: ทดสอบ token หมดอายุ/ไม่ถูกต้อง**

ใน DevTools Console: `localStorage.setItem("ezstream_token", "invalid.token.value")` → reload `/dashboard`
Expected: เข้าได้ปกติ — `api()` เจอ 401, ล้าง token, auto-login ใหม่, retry สำเร็จ (Network tab: คำขอแรก 401 → login → คำขอซ้ำ 200)

- [ ] **Step 5: ยืนยันหน้า auth ถูกลบ**

เปิด `http://localhost:3000/auth/login`
Expected: 404 (หน้าไม่มีแล้ว)

- [ ] **Step 6: (ไม่มี commit — task นี้เป็นการตรวจงานเท่านั้น)**

หากทุกขั้นตอนผ่าน งานเสร็จสมบูรณ์ หากขั้นตอนใดล้มเหลว ให้กลับไปแก้ Task ที่เกี่ยวข้อง

---

## Self-Review

**Spec coverage:**
- บัญชี default hardcode → Task 1 Step 2 (`DEFAULT_ACCOUNT`) ✓
- `ensureSession()` login/register อัตโนมัติ → Task 1 Step 2 ✓
- กัน login ซ้ำเมื่อหลายคำขอพร้อมกัน (in-flight promise) → Task 1 Step 2 (`sessionPromise`) ✓
- `api()` ensure session ก่อน + retry 401 1 ครั้ง → Task 1 Step 3 ✓
- ลบ `/auth/login`, `/auth/register` → Task 2 ✓
- ตรวจ/ลบลิงก์ที่ชี้ `/auth/*` → Task 2 Step 1 (ยืนยันแล้วว่าไม่มี) ✓
- API ไม่แก้ → ไม่มี task แตะ `apps/api` ✓
- Manual test ทั้ง 5 กรณีใน spec → Task 3 ✓

**Placeholder scan:** ไม่มี TBD/TODO — โค้ดครบทุก step ✓

**Type consistency:** `ensureSession()` คืน `Promise<string>`, `clearToken()` คืน `void`, `requestToken()` คืน `Promise<string>` — ใช้สอดคล้องกันทั้ง Task 1 ✓
