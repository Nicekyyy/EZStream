import { Button } from "@ezstream/ui";
import Link from "next/link";
import { HeroDemo } from "../components/hero-demo";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0F0F13] px-6 py-20 text-[#FAFAFA] selection:bg-[#E5FC52] selection:text-[#0F0F13] overflow-hidden">
      <section className="mx-auto w-full max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          {/* Left Column: Text & CTA */}
          <div className="flex flex-col items-start z-10 relative">
            <div className="mb-6 inline-block bg-[#E5FC52] px-3 py-1 text-sm font-black uppercase tracking-widest text-[#0F0F13] shadow-[4px_4px_0_0_#8B5CF6]">
              ยกระดับไลฟ์สตรีมของคุณ
            </div>
            
            <h1 className="max-w-2xl text-5xl font-black leading-[1.05] tracking-tighter sm:text-6xl lg:text-[5.5rem]">
              LIVE STREAM
              <br />
              <span className="text-[#8B5CF6]">WIDGETS</span> &
              <br />
              OVERLAYS
            </h1>
            
            <p className="mt-6 max-w-xl text-lg font-medium leading-tight text-[#A1A1AA] sm:text-xl">
              สร้างสีสันให้ช่องของคุณ! จัดการแจ้งเตือน แชท และระบบเสียง (TTS) ได้แบบเรียลไทม์ ครบจบในที่เดียว ให้คุณโฟกัสกับคนดูได้เต็มที่
            </p>
            
            <div className="mt-10">
              <Button asChild size="lg" className="h-14 rounded-none bg-[#FAFAFA] px-8 text-lg font-black uppercase tracking-wide text-[#0F0F13] hover:bg-[#E5FC52] hover:text-[#0F0F13] border-2 border-transparent hover:border-[#0F0F13] shadow-[6px_6px_0_0_#8B5CF6] hover:translate-y-1 hover:translate-x-1 hover:shadow-[3px_3px_0_0_#8B5CF6] active:translate-y-1.5 active:translate-x-1.5 active:shadow-none transition-all duration-200">
                <Link href="/auth/login">เริ่มสร้างหน้าจอของคุณ</Link>
              </Button>
            </div>
          </div>

          {/* Right Column: Visual Demo */}
          <div className="relative w-full z-0">
            {/* Decorative background blur for depth */}
            <div className="absolute -inset-8 bg-[#8B5CF6]/20 blur-[80px] rounded-full opacity-50 mix-blend-screen" />
            <HeroDemo />
          </div>
        </div>
      </section>
    </main>
  );
}
