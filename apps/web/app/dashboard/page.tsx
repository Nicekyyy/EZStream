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
    <DashboardShell title="Command Center">
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
            <ResourceCard className="p-8 sm:p-12 bg-surface-base border-border-base hover:shadow-none hover:translate-y-0">
              <div className="flex flex-col gap-2 mb-10 border-b border-border-subtle pb-8">
                <h2 className="text-3xl sm:text-5xl font-bold">Test Alerts</h2>
                <p className="text-lg font-medium opacity-80">ยิง event จำลองเพื่อทดสอบ Overlay แบบทันที</p>
              </div>
              
              {data?.overlays.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-6 bg-surface-base p-16 text-center border-4 border-surface-base">
                  <p className="text-white text-2xl font-semibold">ยังไม่มี Overlay ที่ใช้งานได้</p>
                  <Button asChild size="lg" className="bg-primary text-surface-base hover:opacity-90 shadow-none transition-opacity font-semibold">
                    <Link href="/dashboard/overlays">สร้าง Overlay ก่อนทดสอบ</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {mockEvents.map((event, index) => (
                    <button 
                      key={event} 
                      disabled={busyType === event}
                      onClick={() => void sendMockEvent(event)}
                      className="group relative overflow-hidden bg-surface-dark border border-border-base h-32 sm:h-40 text-center hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:border-primary focus-visible:ring-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center text-ink-base"
                    >
                      <span className="text-xl sm:text-2xl font-medium capitalize group-hover:scale-105 transition-transform duration-300">{busyType === event ? "..." : event}</span>
                      <span className="absolute bottom-3 text-xs font-semibold text-ink-subtle opacity-80 group-hover:text-primary transition-colors">ALT+{index + 1}</span>
                    </button>
                  ))}
                </div>
              )}
            </ResourceCard>
          </div>
          
          {/* Right Column: Overlays & Configs */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-white">Active Overlays</h3>
            <div className="flex flex-col gap-4">
              {data?.overlays.map((overlay) => (
                <ResourceCard key={overlay.id} className="flex flex-col justify-between p-5">
                  <div className="flex justify-between items-start gap-4">
                    <p className="font-bold text-white truncate">{overlay.name}</p>
                    <Badge tone={overlay.isActive ? "success" : "neutral"}>{overlay.isActive ? "ON" : "OFF"}</Badge>
                  </div>
                  <div className="mt-6 flex gap-2">
                    <button 
                      onClick={() => void copyUrl(overlay.token)}
                      className="flex-1 bg-surface-dark border-2 border-border-base min-h-[44px] text-xs font-semibold text-white hover:border-primary hover:text-primary hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:border-primary transition-all shadow-none hover:shadow-brutal-sm"
                    >
                      Copy URL
                    </button>
                    <Link 
                      href={`/dashboard/overlays/edit?id=${overlay.id}`}
                      className="bg-surface-dark border-2 border-border-base px-4 min-h-[44px] flex items-center justify-center text-xs font-semibold text-ink-muted hover:text-white hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:border-primary transition-all shadow-none hover:shadow-brutal-sm"
                    >
                      Edit
                    </Link>
                  </div>
                </ResourceCard>
              ))}
              {data?.overlays.length === 0 && (
                <EmptyState title="No active overlays" description="สร้าง Overlay และเปิดใช้งานก่อนนำ URL ไปใช้" />
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </DashboardShell>
  );
}
