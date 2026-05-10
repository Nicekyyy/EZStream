"use client";

export function ResourceCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">{children}</div>;
}
