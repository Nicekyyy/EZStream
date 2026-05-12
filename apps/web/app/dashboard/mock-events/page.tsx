"use client";

import { Button } from "@ezstream/ui";
import { useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { Notice } from "../../../components/ui-kit";
import { api } from "../../../lib/api";

const events = ["chat", "gift", "follow", "like", "share", "join"];

export default function MockEventsPage() {
  const [last, setLast] = useState("");
  const [error, setError] = useState("");
  const [busyType, setBusyType] = useState("");

  async function send(type: string) {
    setBusyType(type);
    setError("");
    setLast("");
    try {
      const result = await api<{ eventType: string; matchedRuleIds: string[] }>(`/mock-events/${type}`, {
        method: "POST",
        body: JSON.stringify({ username: "dashboard", message: "!hello" })
      });
      setLast(`${result.eventType} matched ${result.matchedRuleIds.length} rule(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่ง Mock Event ไม่สำเร็จ");
    } finally {
      setBusyType("");
    }
  }

  return (
    <DashboardShell title="Mock Events">
      <ResourceCard>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white">ส่ง event ทดสอบ</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">ใช้สำหรับตรวจ rule, widget action และ overlay realtime โดยไม่ต้องรอ event จริง</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {events.map((event) => (
            <Button key={event} variant="secondary" disabled={busyType === event} onClick={() => void send(event)} type="button">
              {busyType === event ? "Sending..." : event}
            </Button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {last ? <Notice tone="success">{last}</Notice> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
        </div>
      </ResourceCard>
    </DashboardShell>
  );
}
