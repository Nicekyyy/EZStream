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
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.16),transparent_32rem),#020617] px-4 py-10 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
        <div className="mb-6">
          <p className="text-sm font-medium text-indigo-300">EZStream</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">เข้าสู่ระบบ</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">ใช้บัญชี demo หรือบัญชี creator ของคุณเพื่อจัดการ overlay และ widget</p>
        </div>

        <div className="space-y-4">
          <Field label="อีเมล">
            <Input autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="รหัสผ่าน">
            <Input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button className="w-full" disabled={loading} type="submit">
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
        </div>

        <div className="mt-5 text-center text-sm text-slate-400">
          ยังไม่มีบัญชี?{" "}
          <Link className="font-medium text-indigo-300 hover:text-indigo-200" href="/auth/register">
            สมัครบัญชีใหม่
          </Link>
        </div>
      </form>
    </main>
  );
}
