"use client";

import { Button } from "@ezstream/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "../lib/api";

const navItems = [
  ["/dashboard", "ภาพรวม"],
  ["/dashboard/overlays", "Overlays"],
  ["/dashboard/widgets", "Widgets"],
  ["/dashboard/rules", "Rules"],
  ["/dashboard/events", "Events"],
  ["/dashboard/tts", "TTS"],
  ["/dashboard/chat", "Chat"],
  ["/dashboard/media", "Media"],
  ["/dashboard/mock-events", "Mock Events"]
];

export function DashboardShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.12),transparent_34rem),#020617] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-white">
              EZStream
            </Link>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearToken();
                router.push("/auth/login");
              }}
            >
              ออกจากระบบ
            </Button>
          </div>
          <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1 text-sm scrollbar-hide" aria-label="Dashboard navigation">
            {navItems.map(([href, label]) => {
              const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`whitespace-nowrap rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    active ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="mb-5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
        {children}
      </section>
    </main>
  );
}
