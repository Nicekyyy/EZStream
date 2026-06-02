"use client";

import { Button } from "@ezstream/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Field, Input, Notice } from "../../../components/ui-kit";
import { api, setToken } from "../../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setToken(result.accessToken);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-surface-base text-slate-100 lg:grid-cols-2">
      {/* Left Side: Form */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20 xl:px-32">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-10">
            <div className="mb-4 inline-block bg-primary px-3 py-1 text-xs font-bold uppercase tracking-widest text-black">
              EZStream
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-white lg:text-5xl">
              เข้าสู่ระบบ
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-400">
              ใช้บัญชี demo หรือบัญชี creator ของคุณเพื่อจัดการ overlay และ widget สำหรับไลฟ์สตรีม
            </p>
          </div>

          <form onSubmit={submit} className="space-y-6">
            <div className="space-y-5">
              <Field label="อีเมล">
                <Input
                  id="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-none border-2 border-slate-700 bg-surface-card px-4 py-3 text-white placeholder-slate-400 transition-colors focus:border-primary focus:outline-none focus:ring-0"
                />
              </Field>
              <Field label="รหัสผ่าน">
                <Input
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-none border-2 border-slate-700 bg-surface-card px-4 py-3 text-white placeholder-slate-400 transition-colors focus:border-primary focus:outline-none focus:ring-0"
                />
              </Field>
            </div>

            {error ? (
              <div role="alert" aria-live="polite" className="border-2 border-red-500 bg-red-500/10 p-3 text-sm font-medium text-red-400">
                {error}
              </div>
            ) : null}

            <button
              className="mt-6 w-full border-2 border-transparent hover:border-black bg-primary py-4 text-center text-sm font-black uppercase tracking-widest text-black shadow-brutal-lg transition-all duration-200 hover:translate-x-1 hover:translate-y-1 hover:shadow-brutal-sm active:translate-x-1.5 active:translate-y-1.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-70"
              disabled={loading}
              type="submit"
            >
              {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>

            <div className="mt-8 text-center text-sm font-medium text-slate-400">
              ยังไม่มีบัญชี?{" "}
              <Link
                className="text-accent hover:text-primary hover:underline"
                href="/auth/register"
              >
                สมัครบัญชีใหม่
              </Link>
            </div>
          </form>
        </div>
      </div>

      {/* Right Side: Visual Probe (Restrained Brutalism) */}
      <div aria-hidden="true" className="hidden relative flex-col items-center justify-center overflow-hidden bg-surface-dark lg:flex border-l-2 border-slate-900">
        {/* Subtle grid background */}
        <div 
          className="absolute inset-0 opacity-20" 
          style={{ backgroundImage: 'linear-gradient(var(--color-surface-card) 1px, transparent 1px), linear-gradient(90deg, var(--color-surface-card) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />
        
        <div className="relative w-full max-w-sm border-2 border-accent bg-surface-base p-8 shadow-[12px_12px_0_0_var(--color-accent)] transition-transform duration-500 hover:-translate-y-2">
          <div className="mb-6 flex items-center justify-between">
            <div className="text-xl font-black uppercase tracking-tight text-white">Sub Goal</div>
            <span className="text-sm font-bold text-primary">85 / 100</span>
          </div>
          
          <div className="h-6 w-full border-2 border-slate-700 bg-surface-card overflow-hidden">
            <div className="h-full w-[85%] bg-primary transition-all duration-1000 ease-out" />
          </div>

          <div className="mt-6 flex items-center space-x-3 text-sm text-slate-400 font-medium">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span>LIVE PREVIEW</span>
          </div>
        </div>
      </div>
    </main>
  );
}
