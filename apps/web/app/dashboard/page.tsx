"use client";

import { Button } from "@ezstream/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { ResourceCard } from "../../components/resource-card";
import { Badge, EmptyState, LoadingCards, Notice } from "../../components/ui-kit";
import { APP_URL, api } from "../../lib/api";
import { copyText } from "../../lib/clipboard";

type DashboardData = {
  user?: { email: string };
  creator?: { slug: string; displayName: string };
  overlays: { id: string; name: string; token: string; isActive: boolean }[];
  widgets: { id: string; name: string; type: string; overlayId: string }[];
};

const mockEvents = ["chat", "gift", "follow", "like", "share", "join"];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyType, setBusyType] = useState("");
  const loading = !data && !error;

  useEffect(() => {
    Promise.all([
      api<{ email: string; creator: { slug: string; displayName: string } }>("/auth/me"),
      api<DashboardData["overlays"]>("/overlays"),
      api<DashboardData["widgets"]>("/widgets")
    ])
      .then(([me, overlays, widgets]) => setData({ user: me, creator: me.creator, overlays, widgets }))
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.key >= "1" && e.key <= "6") {
        const index = parseInt(e.key, 10) - 1;
        const eventType = mockEvents[index];
        if (eventType && busyType !== eventType) {
          e.preventDefault();
          void sendMockEvent(eventType);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busyType]);

  async function sendMockEvent(type: string) {
    setBusyType(type);
    setError("");
    setMessage("");
    try {
      await api<{ eventType: string }>(`/mock-events/${type}`, {
        method: "POST",
        body: JSON.stringify({ username: "tester", message: "Test Alert!" })
      });
      setMessage(`[ TEST ${type.toUpperCase()} ] Fired successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่ง Mock Event ไม่สำเร็จ");
    } finally {
      setBusyType("");
    }
  }

  async function copyUrl(token: string) {
    const copied = await copyText(`${APP_URL}/overlay?token=${token}`);
    if (copied) {
      setError("");
      setMessage("คัดลอก Overlay URL แล้ว");
    } else {
      setMessage("");
      setError("คัดลอก URL ไม่สำเร็จ");
    }
  }

  return (
    <DashboardShell title="แผงควบคุม">
      <div className="flex flex-col gap-8">
        {(message || error) && (
          <div className="flex flex-col gap-3">
            {message ? <Notice tone="success">{message}</Notice> : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
          </div>
        )}

      {loading ? (
        <LoadingCards count={2} />
      ) : (
        <div className="grid gap-8 lg:grid-cols-3">
          
          {/* Left Column: The Testing Board */}
          <div className="flex flex-col gap-8 lg:col-span-2">
            <div className="border-2 border-border-base bg-surface-card p-6 sm:p-10">
              <div className="mb-6 flex flex-col gap-1 border-b border-border-subtle pb-6">
                <h2 className="text-xl font-semibold text-ink-base">ทดสอบการแจ้งเตือน</h2>
                <p className="text-sm font-medium text-ink-subtle">ยิง event จำลองเพื่อทดสอบ Overlay แบบทันที</p>
              </div>
              
              {data?.overlays.length === 0 ? (
                <EmptyState 
                  title="ยังไม่มี Overlay ที่ใช้งานได้" 
                  description="สร้าง Overlay ก่อนทดสอบการแจ้งเตือน"
                  action={
                    <Button asChild>
                      <Link href="/dashboard/overlays">สร้าง Overlay</Link>
                    </Button>
                  }
                />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {mockEvents.map((event, index) => (
                    <button 
                      key={event} 
                      disabled={busyType === event}
                      onClick={() => void sendMockEvent(event)}
                      className="group relative flex h-28 flex-col items-center justify-center overflow-hidden border-2 border-border-base bg-surface-dark text-center text-ink-base transition-colors hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-lg font-semibold capitalize">{busyType === event ? "กำลังส่ง..." : event}</span>
                      <span className="mt-2 text-[10px] font-semibold text-ink-faint">ALT + {index + 1}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Right Column: Overlays & Configs */}
          <div className="flex flex-col gap-4 lg:col-span-1">
            <h3 className="text-sm font-semibold text-ink-muted">Overlay ที่เปิดใช้งาน</h3>
            <div className="flex flex-col gap-4">
              {data?.overlays.map((overlay) => (
                <div key={overlay.id} className="flex flex-col justify-between border-2 border-border-base bg-surface-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <p className="truncate font-semibold text-ink-base">{overlay.name}</p>
                    <Badge tone={overlay.isActive ? "success" : "neutral"}>{overlay.isActive ? "ON" : "OFF"}</Badge>
                  </div>
                  <div className="mt-6 flex gap-2">
                    <Button 
                      variant="secondary"
                      size="sm"
                      onClick={() => void copyUrl(overlay.token)}
                      className="flex-1"
                    >
                      คัดลอก URL
                    </Button>
                    <Button variant="secondary" size="sm" asChild>
                      <Link href={`/dashboard/overlays/edit?id=${overlay.id}`}>แก้ไข</Link>
                    </Button>
                  </div>
                </div>
              ))}
              {data?.overlays.length === 0 && (
                <EmptyState title="ไม่มี Overlay ที่เปิดใช้งาน" description="สร้าง Overlay และเปิดใช้งานก่อนนำ URL ไปใช้" />
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </DashboardShell>
  );
}
