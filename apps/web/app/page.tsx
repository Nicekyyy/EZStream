import { Button } from "@ezstream/ui";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.18),transparent_34rem),#020617] px-6 py-12 text-slate-100">
      <section className="mx-auto w-full max-w-5xl">
        <p className="text-sm font-medium text-indigo-300">EZStream MVP</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Live Stream Widget และ Real-time Overlay
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">
          Dashboard สำหรับจัดการ overlay, widget, rule automation และ TTS เพื่อช่วยให้ creator คุมประสบการณ์บนสตรีมได้ง่ายขึ้น
        </p>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link href="/auth/login">เริ่มต้นใช้งาน</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
