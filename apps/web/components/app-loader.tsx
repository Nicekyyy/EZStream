"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "../lib/api";
import { EzstreamLogo } from "./icons";

export function AppLoader({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        await api("/health");
        if (mounted) setIsReady(true);
      } catch (err) {
        if (mounted) {
          setTimeout(checkHealth, 500);
        }
      }
    };
    checkHealth();
    return () => { mounted = false; };
  }, []);

  if (isReady) {
    return <>{children}</>;
  }

  if (pathname?.startsWith("/overlay") || pathname?.startsWith("/public")) {
    return null; 
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-surface-dark text-ink-base">
      <div className="flex animate-pulse flex-col items-center gap-6">
        <EzstreamLogo className="h-16 w-auto invert brightness-0" />
        <div className="flex flex-col items-center gap-2">
          <p className="text-xl font-bold text-primary">กำลังเริ่มต้นระบบ...</p>
          <p className="text-sm text-ink-subtle">รอสักครู่ โปรแกรมกำลังเตรียมความพร้อม</p>
        </div>
      </div>
    </div>
  );
}
