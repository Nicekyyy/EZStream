"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EzstreamLogo } from "../../components/icons";

const navItems = [
  ["/dashboard", "ภาพรวม"],
  ["/dashboard/overlays", "Overlays"],
  ["/dashboard/widgets", "Widgets"],
  ["/dashboard/tts", "TTS"],
  ["/dashboard/chat", "Chat"],
  ["/dashboard/settings", "ตั้งค่า"]
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-surface-base text-ink-base">
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-dark">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="mb-2 inline-flex min-h-[44px] items-center justify-center px-2 text-sm font-semibold text-primary transition-opacity hover:opacity-90 focus-visible:border-2 focus-visible:border-primary focus-visible:outline-none">
              <EzstreamLogo className="h-10 w-auto invert brightness-0" />
            </Link>
          </div>
          <nav className="-mx-1 flex gap-2 overflow-x-auto pb-1 text-sm scrollbar-hide" aria-label="Dashboard navigation">
            {navItems.map(([href, label]) => {
              const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex min-h-[44px] items-center justify-center whitespace-nowrap border-2 px-4 text-xs font-semibold transition-all focus-visible:border-primary focus-visible:outline-none ${
                    active ? "border-primary bg-surface-card text-primary shadow-brutal-sm" : "border-transparent text-ink-subtle hover:border-border-base hover:text-white"
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
        {children}
      </section>
    </main>
  );
}
