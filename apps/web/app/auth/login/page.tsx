"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <form onSubmit={submit} className="space-y-4 rounded-md border bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold">เข้าสู่ระบบ</h1>
        <input className="w-full rounded-md border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="อีเมล" />
        <input className="w-full rounded-md border px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="รหัสผ่าน" type="password" />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button disabled={loading} className="w-full rounded-md bg-slate-950 px-4 py-2 text-white disabled:opacity-50">
          {loading ? "กำลังเข้าสู่ระบบ" : "เข้าสู่ระบบ"}
        </button>
        <Link className="block text-sm text-slate-600 underline" href="/auth/register">สมัครบัญชีใหม่</Link>
      </form>
    </main>
  );
}
