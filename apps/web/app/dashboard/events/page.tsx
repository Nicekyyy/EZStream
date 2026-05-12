"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { Badge, EmptyState, LoadingCards, Notice } from "../../../components/ui-kit";
import { api } from "../../../lib/api";

type EventLog = { id: string; eventType: string; status: string; createdAt: string; matchedRuleIds: string[] };

export default function EventsPage() {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<EventLog[]>("/events")
      .then(setEvents)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Events ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardShell title="Events">
      <div className="mb-5">
        <p className="max-w-2xl text-sm leading-6 text-slate-400">ตรวจสอบ event ล่าสุดและจำนวน rule ที่ match เพื่อ debug automation</p>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? (
        <LoadingCards />
      ) : events.length ? (
        <div className="grid gap-3">
          {events.map((event) => (
            <ResourceCard key={event.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-white">{event.eventType}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {new Date(event.createdAt).toLocaleString()} · matched {event.matchedRuleIds.length}
                  </p>
                </div>
                <Badge tone={event.status === "MATCHED" ? "success" : "neutral"}>{event.status}</Badge>
              </div>
            </ResourceCard>
          ))}
        </div>
      ) : (
        <EmptyState title="ยังไม่มี Event" description="ลองส่ง mock event หรือเชื่อมต่อ live source เพื่อดู event ที่เข้ามา" />
      )}
    </DashboardShell>
  );
}
