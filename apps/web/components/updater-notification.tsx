"use client";

import { useEffect, useState } from "react";

// Helper to check if we are in Tauri environment
const isTauri = () => typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;

export function UpdaterNotification() {
  const [updateInfo, setUpdateInfo] = useState<{ version: string; body: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    let mounted = true;

    async function checkForUpdates() {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        
        if (update?.available && mounted) {
          setUpdateInfo({
            version: update.version,
            body: update.body || "มีอัปเดตใหม่พร้อมให้ดาวน์โหลด",
          });
        }
      } catch (err) {
        console.error("Failed to check for updates:", err);
      }
    }

    checkForUpdates();

    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdate = async () => {
    if (!isTauri() || !updateInfo) return;
    
    setIsUpdating(true);
    setError(null);
    
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      
      const update = await check();
      if (update?.available) {
        await update.downloadAndInstall();
        await relaunch();
      } else {
        setError("ไม่พบอัปเดต หรืออัปเดตถูกติดตั้งไปแล้ว");
        setIsUpdating(false);
      }
    } catch (err) {
      console.error("Update failed:", err);
      setError("เกิดข้อผิดพลาดในการติดตั้งอัปเดต");
      setIsUpdating(false);
    }
  };

  if (!updateInfo) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] w-80 rounded-xl border border-primary/20 bg-surface-dark p-5 shadow-2xl backdrop-blur-md">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-primary">อัปเดตใหม่พร้อมใช้งาน!</h3>
          <button 
            onClick={() => setUpdateInfo(null)}
            className="text-ink-subtle hover:text-ink-base"
            disabled={isUpdating}
          >
            ✕
          </button>
        </div>
        
        <div className="text-sm text-ink-base">
          เวอร์ชัน <strong>{updateInfo.version}</strong>
          <p className="mt-1 text-xs text-ink-subtle line-clamp-3">{updateInfo.body}</p>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="mt-2 flex gap-2">
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-ink-inverse hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {isUpdating ? "กำลังอัปเดต..." : "อัปเดตเลย"}
          </button>
        </div>
      </div>
    </div>
  );
}
