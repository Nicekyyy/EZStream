"use client";

import { useEffect, useState } from "react";
import { User, Heart, MessageSquare, Plus } from "lucide-react";

export function HeroDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Loop the demo sequence
    const interval = setInterval(() => {
      setStep((prev) => (prev + 1) % 4);
    }, 2500); // Change step every 2.5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[#A1A1AA]/20 bg-[#09090B] shadow-[0_0_80px_-20px_rgba(139,92,246,0.3)]">
      {/* Fake game/stream background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.15),transparent_70%)]" />

      {/* Grid overlay for texture */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px]" />

      {/* Top Info Bar */}
      <div className="absolute left-4 top-4 flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded bg-red-600 px-2 py-1 text-xs font-bold text-white shadow-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          LIVE
        </div>
        <div className="flex items-center gap-1.5 rounded bg-[#0F0F13]/80 px-2 py-1 text-xs font-bold text-[#A1A1AA] backdrop-blur-sm border border-white/5">
          <User className="h-3 w-3" />
          <span className="tabular-nums transition-all duration-500">
            {step >= 3 ? "1,245" : "1,203"}
          </span>
        </div>
      </div>

      {/* Donation Alert Widget */}
      <div
        className={`absolute left-1/2 top-12 flex -translate-x-1/2 flex-col items-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          step === 2 || step === 3
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-8 scale-90 opacity-0"
        }`}
      >
        <div className="relative mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-[#E5FC52] shadow-[0_0_40px_-5px_rgba(229,252,82,0.6)]">
          <Heart className="h-10 w-10 animate-bounce text-[#0F0F13]" fill="currentColor" />
          {/* Sparkles */}
          <div className="absolute -left-2 top-0 h-3 w-3 animate-ping rounded-full bg-[#E5FC52]" />
          <div className="absolute -right-1 bottom-2 h-2 w-2 animate-ping rounded-full bg-[#E5FC52]" style={{ animationDelay: "200ms" }} />
        </div>
        <div className="rounded-lg bg-[#8B5CF6] px-4 py-2 text-center shadow-lg border border-purple-400">
          <p className="text-sm font-black uppercase text-white drop-shadow-md">
            NEW DONATION!
          </p>
          <p className="text-xs font-bold text-purple-100">
            xX_GamerPro_Xx sent <span className="text-[#E5FC52]">500 THB</span>
          </p>
        </div>
      </div>

      {/* Chat Widget Container */}
      <div className="absolute bottom-4 right-4 flex w-64 flex-col justify-end gap-2 overflow-hidden mask-image-[linear-gradient(to_bottom,transparent,black_20%)] h-48">
        
        {/* Chat message 1 */}
        <div className="transition-all duration-300 opacity-100 translate-y-0">
          <div className="rounded bg-[#0F0F13]/80 p-2 text-xs text-[#FAFAFA] backdrop-blur-md border border-white/5">
            <span className="font-bold text-[#8B5CF6]">Ninja_12:</span> YOOOOO! That was insane!
          </div>
        </div>

        {/* Chat message 2 */}
        <div
          className={`transition-all duration-300 ${
            step >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="rounded bg-[#0F0F13]/80 p-2 text-xs text-[#FAFAFA] backdrop-blur-md border border-white/5">
            <span className="font-bold text-[#E5FC52]">NoobMaster:</span> KEKW LMAO
          </div>
        </div>

        {/* Chat message 3 */}
        <div
          className={`transition-all duration-300 ${
            step >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="rounded bg-[#0F0F13]/80 p-2 text-xs text-[#FAFAFA] backdrop-blur-md border border-white/5 border-l-2 border-l-[#8B5CF6]">
            <span className="font-bold text-[#8B5CF6]">xX_GamerPro_Xx:</span> 💰 TAKE MY MONEY!
          </div>
        </div>

      </div>

      {/* Mock Controls (for aesthetics) */}
      <div className="absolute bottom-4 left-4 flex gap-2 opacity-50">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <MessageSquare className="h-4 w-4 text-white" />
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <Plus className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  );
}
