import { Button } from "@ezstream/ui";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-6 px-6">
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-500">EZStream MVP</p>
        <h1 className="text-4xl font-semibold tracking-normal text-slate-950">
          Live Stream Widget และ Real-time Overlay
        </h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600">
          Phase 1 สร้างโครงสร้าง monorepo สำหรับ dashboard, API, worker, database และ shared packages
        </p>
      </div>
      <div>
        <Button asChild><Link href="/auth/login">เริ่มต้นระบบ</Link></Button>
      </div>
    </main>
  );
}
