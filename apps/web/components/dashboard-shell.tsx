"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  ["/dashboard", "ภาพรวม"],
  ["/dashboard/overlays", "Overlays"],
  ["/dashboard/widgets", "Widgets"],
  ["/dashboard/events", "Events"],
  ["/dashboard/tts", "TTS"],
  ["/dashboard/chat", "Chat"],
  ["/dashboard/media", "Media"],
  ["/dashboard/mock-events", "Mock Events"],
  ["/dashboard/settings", "Settings"]
];

export function DashboardShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-surface-base text-ink-base">
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-dark">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="mb-2 inline-flex items-center justify-center min-h-[44px] bg-primary px-4 text-sm font-semibold text-surface-base rounded-md hover:opacity-90 transition-opacity">
              EZStream
            </Link>
          </div>
          <nav className="-mx-1 flex gap-2 overflow-x-auto pb-1 text-sm scrollbar-hide" aria-label="Dashboard navigation">
            {navItems.map(([href, label]) => {
              const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`whitespace-nowrap rounded-md px-4 min-h-[44px] flex items-center justify-center text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    active ? "bg-surface-base text-primary shadow-sm" : "text-ink-subtle hover:bg-surface-base hover:text-white"
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
        <h1 className="mb-8 text-3xl font-semibold text-white sm:text-4xl">{title}</h1>
        {children}
      </section>
    </main>
  );
}
