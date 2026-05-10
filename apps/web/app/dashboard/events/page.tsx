"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { api } from "../../../lib/api";

type EventLog = { id: string; eventType: string; status: string; createdAt: string; matchedRuleIds: string[] };

export default function EventsPage() {
  const [events, setEvents] = useState<EventLog[]>([]);
  useEffect(() => void api<EventLog[]>("/events").then(setEvents), []);
  return (
    <DashboardShell title="Events">
      <div className="grid gap-3">{events.map((event) => <ResourceCard key={event.id}><p className="font-medium">{event.eventType}</p><p className="text-sm text-slate-400">{event.status} · matched {event.matchedRuleIds.length}</p></ResourceCard>)}</div>
    </DashboardShell>
  );
}
