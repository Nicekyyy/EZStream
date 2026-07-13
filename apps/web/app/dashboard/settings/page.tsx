"use client";

import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { ResourceCard } from "../../../components/resource-card";
import { api } from "../../../lib/api";

type CreatorSettings = {
  googleTtsServiceAccountJson?: string;
  googleTtsVoice?: string;
  ttsCooldownMs?: number;
  bannedWords?: string[];
  tiktokSignApiKey?: string;
};

type Creator = {
  id: string;
  displayName: string;
  slug: string;
  bio: string | null;
  settings: CreatorSettings;
};

function safeSettings(raw: unknown): CreatorSettings {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as CreatorSettings;
  return {};
}

export default function SettingsPage() {
  const [creator, setCreator] = useState<Creator | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Form state
  const [credentialsJson, setCredentialsJson] = useState("");
  const [credentialsMasked, setCredentialsMasked] = useState(false);
  const [tiktokSignApiKey, setTiktokSignApiKey] = useState("");
  const [tiktokKeyMasked, setTiktokKeyMasked] = useState(false);

  useEffect(() => {
    loadCreator();
  }, []);

  async function loadCreator() {
    try {
      const data = await api<Creator>("/creator/me");
      setCreator(data);
      const settings = safeSettings(data.settings);

      if (settings.googleTtsServiceAccountJson) {
        setCredentialsJson(""); // Don't show actual key
        setCredentialsMasked(true);
      }

      setTiktokSignApiKey("");
      setTiktokKeyMasked(Boolean(settings.tiktokSignApiKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      // Validate JSON if provided
      if (credentialsJson.trim()) {
        try {
          const parsed = JSON.parse(credentialsJson);
          if (!parsed.client_email || !parsed.private_key) {
            setError("ไฟล์ JSON ต้องมี client_email และ private_key");
            setSaving(false);
            return;
          }
        } catch {
          setError("รูปแบบ JSON ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง");
          setSaving(false);
          return;
        }
      }

      const settings: CreatorSettings = {
        ...(creator ? safeSettings(creator.settings) : {})
      };

      // Only update credentials if user provided new JSON
      if (credentialsJson.trim()) {
        settings.googleTtsServiceAccountJson = credentialsJson.trim();
      }

      // Only update the TikTok key if the user typed a new one. If they clicked
      // "เปลี่ยน" but didn't type anything, `settings` still carries the spread-in
      // redacted placeholder (`true`) from the existing creator settings above, and
      // the server's merge-on-write logic (Task 1) restores the real stored value —
      // same no-op-on-empty behavior as the Google TTS field. Explicit removal goes
      // through the dedicated `removeTiktokKey` button below, not this form submit.
      if (tiktokSignApiKey.trim()) {
        settings.tiktokSignApiKey = tiktokSignApiKey.trim();
      }

      await api("/creator/me", {
        method: "PATCH",
        body: JSON.stringify({ settings })
      });

      setMessage("บันทึกสำเร็จ ✓");
      if (credentialsJson.trim()) {
        setCredentialsJson("");
        setCredentialsMasked(true);
      }
      if (tiktokSignApiKey.trim()) {
        setTiktokSignApiKey("");
        setTiktokKeyMasked(true);
      }
      // Reload to get fresh data
      await loadCreator();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        setCredentialsJson(text);
        setCredentialsMasked(false);
        setMessage("");
        setError("");
      }
    };
    reader.readAsText(file);
    // Reset input value so same file can be selected again
    event.target.value = "";
  }

  function clearCredentials() {
    setCredentialsJson("");
    setCredentialsMasked(false);
  }

  function clearTiktokKey() {
    setTiktokSignApiKey("");
    setTiktokKeyMasked(false);
  }

  async function removeTiktokKey() {
    setError("");
    setMessage("");
    setSaving(true);
    try {
      await api("/creator/me", {
        method: "PATCH",
        body: JSON.stringify({ settings: { ...(creator ? safeSettings(creator.settings) : {}), tiktokSignApiKey: "" } })
      });
      setMessage("ลบคีย์สำเร็จ ✓");
      setTiktokSignApiKey("");
      setTiktokKeyMasked(false);
      await loadCreator();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบคีย์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell title="ตั้งค่า">
        <div className="flex items-center gap-3 text-ink-subtle">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          กำลังโหลด...
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="ตั้งค่า">
      <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-3xl">
        {/* Notifications */}
        {message && (
          <div className="border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            {message}
          </div>
        )}
        {error && (
          <div className="border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            {error}
          </div>
        )}

        {/* ─── Google TTS Credentials ─── */}
        <ResourceCard>
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">ข้อมูลรับรอง Google Cloud TTS</h2>
              <p className="text-sm text-ink-subtle mt-1">
                อัปโหลดไฟล์ Service Account JSON จาก Google Cloud Console เพื่อใช้ Text-to-Speech
              </p>
            </div>

            {credentialsMasked && !credentialsJson.trim() ? (
              <div className="flex items-center gap-3 bg-surface-dark border border-border-base px-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">✓</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Credentials ถูกตั้งค่าแล้ว</p>
                  <p className="text-xs text-ink-subtle">Service Account JSON ถูกบันทึกไว้เรียบร้อย</p>
                </div>
                <button
                  type="button"
                  onClick={clearCredentials}
                  className="text-xs text-ink-subtle hover:text-rose-400 transition-colors"
                >
                  เปลี่ยน
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="credentials-file">
                    อัปโหลดไฟล์ .json
                  </label>
                  <input
                    id="credentials-file"
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-slate-400 file:mr-4 file:rounded-md file:border-0 file:bg-surface-dark file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary/20 file:cursor-pointer file:transition-colors"
                  />
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center px-4" aria-hidden="true">
                    <div className="w-full border-t border-border-subtle" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-surface-base px-3 text-xs text-ink-subtle">หรือ paste JSON</span>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="credentials-json">
                    Service Account JSON
                  </label>
                  <textarea
                    id="credentials-json"
                    className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:border-primary focus:outline-none"
                    rows={6}
                    placeholder='{"type": "service_account", "client_email": "...", "private_key": "...", ...}'
                    value={credentialsJson}
                    onChange={(e) => {
                      setCredentialsJson(e.target.value);
                      setCredentialsMasked(false);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </ResourceCard>

        {/* ─── TikTok Sign API Key ─── */}
        <ResourceCard>
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">TikTok Sign API Key (eulerstream)</h2>
              <p className="text-sm text-ink-subtle mt-1">
                ใช้ลดโอกาสโดน rate limit ตอนเชื่อมต่อแชท TikTok ขอคีย์ได้ที่ eulerstream.com ถ้าไม่กรอก ระบบจะเชื่อมต่อแบบไม่ signed
              </p>
            </div>

            {tiktokKeyMasked && !tiktokSignApiKey.trim() ? (
              <div className="flex items-center gap-3 bg-surface-dark border border-border-base px-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">✓</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">ตั้งค่าคีย์แล้ว</p>
                  <p className="text-xs text-ink-subtle">TikTok Sign API Key ถูกบันทึกไว้เรียบร้อย</p>
                </div>
                <button
                  type="button"
                  onClick={clearTiktokKey}
                  className="text-xs text-ink-subtle hover:text-primary transition-colors"
                >
                  เปลี่ยน
                </button>
                <button
                  type="button"
                  onClick={removeTiktokKey}
                  disabled={saving}
                  className="text-xs text-ink-subtle hover:text-rose-400 transition-colors disabled:opacity-50"
                >
                  ลบคีย์
                </button>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="tiktok-sign-api-key">
                  Sign API Key
                </label>
                <input
                  id="tiktok-sign-api-key"
                  type="password"
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-primary focus:outline-none"
                  placeholder="ใส่ TikTok Sign API Key"
                  value={tiktokSignApiKey}
                  onChange={(e) => {
                    setTiktokSignApiKey(e.target.value);
                    setTiktokKeyMasked(false);
                  }}
                />
              </div>
            )}
          </div>
        </ResourceCard>

        {/* ─── Save Button ─── */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-surface-base px-6 min-h-[44px] text-sm font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </button>
        </div>
      </form>
    </DashboardShell>
  );
}
