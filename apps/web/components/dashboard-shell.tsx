"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "../lib/api";

const navItems = [
  ["/dashboard", "ภาพรวม"],
  ["/dashboard/overlays", "Overlays"],
  ["/dashboard/widgets", "Widgets"],
  ["/dashboard/rules", "Rules"],
  ["/dashboard/events", "Events"],
  ["/dashboard/tts", "TTS"],
  ["/dashboard/media", "Media"],
  ["/dashboard/mock-events", "Mock Events"]
];

export function DashboardShell({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-semibold">EZStream</Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {navItems.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-md px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950">
                {label}
              </Link>
            ))}
            <button
              className="rounded-md px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              onClick={() => {
                clearToken();
                router.push("/auth/login");
              }}
            >
              ออกจากระบบ
            </button>
          </nav>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
        {children}
      </section>
    </main>
  );
}
