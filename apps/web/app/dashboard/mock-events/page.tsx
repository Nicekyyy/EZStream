"use client";

import { useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { api } from "../../../lib/api";

const events = ["chat", "gift", "follow", "like", "share", "join"];

export default function MockEventsPage() {
  const [last, setLast] = useState("");
  async function send(type: string) {
    const result = await api<{ eventType: string; matchedRuleIds: string[] }>(`/mock-events/${type}`, {
      method: "POST",
      body: JSON.stringify({ username: "dashboard", message: "!hello" })
    });
    setLast(`${result.eventType} matched ${result.matchedRuleIds.length}`);
  }
  return (
    <DashboardShell title="Mock Events">
      <ResourceCard>
        <div className="flex flex-wrap gap-2">{events.map((event) => <button key={event} onClick={() => void send(event)} className="rounded-md bg-slate-950 px-4 py-2 text-white">{event}</button>)}</div>
        {last ? <p className="mt-3 text-sm text-emerald-700">{last}</p> : null}
      </ResourceCard>
    </DashboardShell>
  );
}
