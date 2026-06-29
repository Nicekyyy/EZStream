"use client";

export function DashboardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold text-ink-base">{title}</h1>
      {children}
    </>
  );
}
