"use client";

import { Button } from "@ezstream/ui";
import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { EmptyState, LoadingCards, Notice } from "../../../components/ui-kit";
import { api } from "../../../lib/api";

type MediaAsset = { id: string; originalName: string; type: string };

export default function MediaPage() {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  async function load() {
    setItems(await api<MediaAsset[]>("/media"));
  }

  useEffect(() => {
    void load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลด Media ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await api<{ message: string }>("/media/upload", { method: "POST", body: form });
      setMessage(result.message || "อัปโหลดไฟล์แล้ว");
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  return (
    <DashboardShell title="Media">
      <ResourceCard className="mb-5">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-sm font-medium text-slate-200">ไฟล์ Media</span>
            <input
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-md border border-slate-700 bg-slate-950/80 text-sm text-slate-300 file:mr-4 file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-100 hover:file:bg-slate-700"
            />
          </label>
          <Button className="sm:mt-6" disabled={!file || uploading} type="submit">
            {uploading ? "กำลังอัปโหลด..." : "Upload"}
          </Button>
        </form>
      </ResourceCard>

      <div className="mb-4 space-y-3">
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>

      {loading ? (
        <LoadingCards />
      ) : items.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ResourceCard key={item.id}>
              <p className="truncate font-medium text-white">{item.originalName}</p>
              <p className="mt-1 text-sm text-slate-400">{item.type}</p>
            </ResourceCard>
          ))}
        </div>
      ) : (
        <EmptyState title="ยังไม่มีไฟล์ Media" description="อัปโหลดไฟล์เสียงหรือรูปภาพเพื่อนำไปใช้กับ widget" />
      )}
    </DashboardShell>
  );
}
