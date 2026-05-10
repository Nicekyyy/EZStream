"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api, setToken } from "../../../lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api<{ accessToken: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, displayName })
      });
      setToken(result.accessToken);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "สมัครบัญชีไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <form onSubmit={submit} className="space-y-4 rounded-md border bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold">สมัครบัญชี Creator</h1>
        <input className="w-full rounded-md border px-3 py-2" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="ชื่อที่แสดง" />
        <input className="w-full rounded-md border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="อีเมล" />
        <input className="w-full rounded-md border px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="รหัสผ่านอย่างน้อย 8 ตัว" type="password" />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button disabled={loading} className="w-full rounded-md bg-slate-950 px-4 py-2 text-white disabled:opacity-50">
          {loading ? "กำลังสมัคร" : "สมัครบัญชี"}
        </button>
        <Link className="block text-sm text-slate-600 underline" href="/auth/login">มีบัญชีแล้ว</Link>
      </form>
    </main>
  );
}
