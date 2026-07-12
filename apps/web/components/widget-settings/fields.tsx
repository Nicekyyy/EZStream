"use client";

import { Button } from "@ezstream/ui";
import { useEffect, useRef, useState } from "react";
import { Field, Input, Select } from "../ui-kit";

export function NumberField({ disabled, label, min, max, onChange, value }: { disabled: boolean; label: string; min?: number; max?: number; onChange: (value: number | "") => void; value: number | "" }) {
  return (
    <Field label={label}>
      <Input disabled={disabled} min={min} max={max} onChange={(event) => {
        let val: number | "" = event.target.value === "" ? "" : Number(event.target.value);
        if (typeof val === "number" && max !== undefined && val > max) val = max;
        onChange(val);
      }} type="number" value={value} />
    </Field>
  );
}

export function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative border-2 px-5 py-2.5 text-sm font-bold uppercase tracking-widest transition-all duration-200 ${
        active 
          ? "border-primary bg-primary text-black translate-x-0.5 translate-y-0.5 shadow-none" 
          : "border-border-base bg-surface-base text-ink-subtle hover:bg-surface-dark hover:text-white shadow-brutal-sm hover:-translate-y-0.5 hover:shadow-brutal-md"
      }`}
    >
      {children}
    </button>
  );
}

export function SettingsSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="relative mb-8 mt-4 border-2 border-border-base bg-surface-base/50 p-6 pt-7 shadow-brutal-sm transition-all hover:shadow-brutal-md">
      <h3 className="absolute -top-3.5 left-4 inline-block border-2 border-primary bg-primary px-3 py-0.5 text-sm font-black uppercase tracking-widest text-black">
        {title}
      </h3>
      <div>
        {children}
      </div>
    </section>
  );
}

export function ToggleField({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: (value: boolean) => void }) {
  const isChecked = !!checked;
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-3 border-2 px-4 py-3 text-sm font-bold transition-all duration-200 ${
      isChecked 
        ? "border-primary bg-primary/10 text-primary shadow-brutal-sm" 
        : "border-border-base bg-surface-base text-white hover:border-ink-faint hover:bg-surface-dark"
    }`}>
      <span>{label}</span>
      <div className={`relative flex h-7 w-14 shrink-0 items-center border-2 transition-colors duration-200 ${
        isChecked ? "border-primary bg-primary" : "border-ink-base bg-surface-dark"
      }`}>
        <div className={`h-4 w-4 border-2 transition-transform duration-200 ${
          isChecked ? "translate-x-[32px] border-black bg-white" : "translate-x-[2px] border-transparent bg-ink-muted"
        }`} />
      </div>
      <input checked={isChecked} className="sr-only" disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

export function ColorField({ disabled, label, onChange, value }: { disabled: boolean; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <Field label={label}>
      <div className="group flex min-w-0 items-center gap-3">
        <div className="relative h-12 w-12 shrink-0 border-2 border-border-base shadow-brutal-sm transition-transform duration-200 group-hover:scale-110 group-hover:shadow-brutal-md">
          <input
            className="absolute -inset-2 h-16 w-16 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            type="color"
            value={value || "#000000"}
          />
          <div className="pointer-events-none h-full w-full border border-black/20" style={{ backgroundColor: value || "#000000" }} />
        </div>
        <Input className="min-w-0 font-mono text-center uppercase tracking-widest transition-colors group-hover:border-primary" disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value || "#000000"} />
      </div>
    </Field>
  );
}

export function RangeField({ disabled, label, max, min, onChange, step, value }: { disabled: boolean; label: string; max: number; min: number; onChange: (value: number) => void; step: number; value: number }) {
  return (
    <Field label={<span className="flex justify-between items-end"><span>{label}</span><span className="font-mono text-primary font-bold">{value ?? 0}</span></span>}>
      <input
        className="mt-1 h-3 w-full cursor-pointer appearance-none border-2 border-border-base bg-surface-dark accent-primary disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value ?? 0}
      />
    </Field>
  );
}

export function FontSettings({ disabled, family, weight, onFamilyChange, onWeightChange, labelPrefix = "" }: { disabled: boolean; family: string; weight: string; onFamilyChange: (f: string) => void; onWeightChange: (w: string) => void; labelPrefix?: string; }) {
  const [localFonts, setLocalFonts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hasLoadedFonts = useRef(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    async function checkPermission() {
      try {
        // @ts-ignore
        const status = await navigator.permissions.query({ name: "local-fonts" });
        if (status.state === "granted") {
          void loadLocalFonts(true);
        }
      } catch (e) {}
    }
    checkPermission();
  }, []);

  async function loadLocalFonts(silent = false) {
    if (hasLoadedFonts.current) return;
    if (!("queryLocalFonts" in window)) {
      if (!silent) setError("เบราว์เซอร์ไม่รองรับ (ต้องใช้ Chrome/Edge รุ่นใหม่)");
      return;
    }
    try {
      if (!silent) setLoading(true);
      setError("");
      // @ts-ignore
      const fonts = await window.queryLocalFonts();
      setLocalFonts(fonts);
      hasLoadedFonts.current = true;
    } catch (err) {
      if (!silent) setError("ไม่อนุญาตหรือโหลดฟอนต์ไม่สำเร็จ");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const uniqueFamilies = Array.from(new Set(localFonts.map(f => f.family as string))).sort();
  const currentFamilyFonts = localFonts.filter(f => f.family === family);
  
  const getWeightFromStyle = (style: string) => {
    const s = style.toLowerCase();
    if (s.includes("thin") || s.includes("hairline")) return "100";
    if (s.includes("extra light") || s.includes("ultra light")) return "200";
    if (s.includes("light")) return "300";
    if (s.includes("medium")) return "500";
    if (s.includes("semi") || s.includes("demi")) return "600";
    if (s.includes("extra bold") || s.includes("ultra bold")) return "800";
    if (s.includes("black") || s.includes("heavy")) return "900";
    if (s.includes("bold")) return "700";
    return "400";
  };

  const availableWeights = currentFamilyFonts.length > 0 
    ? Array.from(new Set(currentFamilyFonts.map(f => getWeightFromStyle(f.style)))).sort() 
    : [];

  // If a user has a loaded font, standard strings like "normal" or "bold" map to 400 and 700
  const normalizedWeight = weight === "normal" ? "400" : weight === "medium" ? "500" : weight === "bold" ? "700" : weight === "black" ? "900" : weight;
  
  // If reverting to system font, map numeric back to standard strings
  const fallbackWeight = weight === "400" ? "normal" : weight === "500" ? "medium" : weight === "700" ? "bold" : weight === "900" ? "black" : (["normal", "medium", "bold", "black"].includes(weight) ? weight : "normal");

  const options = [
    { label: "System (ค่าเริ่มต้น)", value: "system" },
    { label: "Monospace", value: "mono" },
    ...uniqueFamilies.map(f => ({ label: f, value: f }))
  ];
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()) || o.value.toLowerCase().includes(search.toLowerCase()));
  const displayValue = isOpen ? search : (options.find(o => o.value === family)?.label || family);

  return (
    <>
      <Field label={`${labelPrefix}ฟอนต์`}>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2" ref={wrapperRef}>
            <div className="relative w-full">
              <Input 
                disabled={disabled} 
                value={displayValue} 
                onChange={(e) => {
                  setSearch(e.target.value);
                  setIsOpen(true);
                }}
                onFocus={() => {
                  setSearch("");
                  setIsOpen(true);
                  if (!hasLoadedFonts.current) {
                    void loadLocalFonts();
                  }
                }}
                placeholder="ค้นหาฟอนต์..."
                className="pr-8"
              />
              <div className="absolute right-3 top-3 pointer-events-none text-ink-subtle text-xs">▼</div>
              {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-surface-card border-2 border-border-base shadow-xl max-h-60 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <div className="p-3 text-sm text-ink-faint text-center">ไม่พบฟอนต์</div>
                  ) : (
                    filtered.map(opt => (
                      <div 
                        key={opt.value}
                        className={`px-4 py-2 text-sm cursor-pointer hover:bg-primary hover:text-white ${opt.value === family ? "bg-primary/20 text-primary" : "text-white"}`}
                        onClick={() => {
                          onFamilyChange(opt.value);
                          setIsOpen(false);
                          setSearch("");
                        }}
                      >
                        {opt.label}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          {error ? <p className="text-xs text-rose-400">{error}</p> : null}
        </div>
      </Field>

      <Field label={`${labelPrefix}ความหนา`}>
        <Select disabled={disabled} value={currentFamilyFonts.length > 0 ? normalizedWeight : fallbackWeight} onChange={(e) => onWeightChange(e.target.value)}>
          {currentFamilyFonts.length === 0 ? (
            <>
              <option value="normal">ปกติ (Normal)</option>
              <option value="medium">กลาง (Medium)</option>
              <option value="bold">หนา (Bold)</option>
              <option value="black">หนามาก (Black)</option>
            </>
          ) : (
            <>
              {availableWeights.includes("100") && <option value="100">Thin (100)</option>}
              {availableWeights.includes("200") && <option value="200">Extra Light (200)</option>}
              {availableWeights.includes("300") && <option value="300">Light (300)</option>}
              {availableWeights.includes("400") && <option value="400">Regular (400)</option>}
              {availableWeights.includes("500") && <option value="500">Medium (500)</option>}
              {availableWeights.includes("600") && <option value="600">Semi Bold (600)</option>}
              {availableWeights.includes("700") && <option value="700">Bold (700)</option>}
              {availableWeights.includes("800") && <option value="800">Extra Bold (800)</option>}
              {availableWeights.includes("900") && <option value="900">Black (900)</option>}
            </>
          )}
        </Select>
      </Field>
    </>
  );
}

export function SettingsHeader({ busy, description, isDirty, onSave, title }: {
  busy: boolean;
  description: string;
  isDirty: boolean;
  onSave: () => Promise<void>;
  title: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-base font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs font-medium text-ink-subtle">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy}
          onClick={() => void onSave()}
          type="button"
          className={isDirty ? "bg-rose-600 text-white hover:bg-rose-500 border-rose-500 animate-pulse shadow-rose-900/20" : ""}
        >
          บันทึก
        </Button>
      </div>
    </div>
  );
}
