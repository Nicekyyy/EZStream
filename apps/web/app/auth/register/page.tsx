"use client";

import { Button } from "@ezstream/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Field, Input, Notice } from "../../../components/ui-kit";
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
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.16),transparent_32rem),#020617] px-4 py-10 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
        <div className="mb-6">
          <p className="text-sm font-medium text-indigo-300">EZStream</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">สมัครบัญชี Creator</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">สร้างพื้นที่สำหรับจัดการ live overlay, widget และ automation ของคุณ</p>
        </div>

        <div className="space-y-4">
          <Field label="ชื่อที่แสดง">
            <Input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </Field>
          <Field label="อีเมล">
            <Input autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="รหัสผ่าน" hint="อย่างน้อย 8 ตัวอักษร">
            <Input autoComplete="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button className="w-full" disabled={loading} type="submit">
            {loading ? "กำลังสมัคร..." : "สมัครบัญชี"}
          </Button>
        </div>

        <div className="mt-5 text-center text-sm text-slate-400">
          มีบัญชีแล้ว?{" "}
          <Link className="font-medium text-indigo-300 hover:text-indigo-200" href="/auth/login">
            เข้าสู่ระบบ
          </Link>
        </div>
      </form>
    </main>
  );
}
