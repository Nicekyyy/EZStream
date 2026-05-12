"use client";

import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const controlClass =
  "w-full rounded-md border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 shadow-sm transition placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/25 disabled:cursor-not-allowed disabled:opacity-60";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(controlClass, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(controlClass, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(controlClass, props.className)} />;
}

export function Field({
  children,
  hint,
  label,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label {...props} className={cx("block", props.className)}>
      <span className="mb-1.5 block text-sm font-medium text-slate-200">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "error" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-800/70 bg-emerald-950/40 text-emerald-200"
      : tone === "error"
        ? "border-rose-800/70 bg-rose-950/45 text-rose-200"
        : "border-slate-800 bg-slate-900/80 text-slate-300";
  return <div className={cx("rounded-lg border px-4 py-3 text-sm", toneClass)}>{children}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "info" | "warning" | "danger" }) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-950/70 text-emerald-200 ring-emerald-800/70"
      : tone === "info"
        ? "bg-sky-950/70 text-sky-200 ring-sky-800/70"
        : tone === "warning"
          ? "bg-amber-950/70 text-amber-200 ring-amber-800/70"
          : tone === "danger"
            ? "bg-rose-950/70 text-rose-200 ring-rose-800/70"
            : "bg-slate-800/80 text-slate-300 ring-slate-700";
  return <span className={cx("inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1", toneClass)}>{children}</span>;
}

export function PageActions({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">{children}</div>;
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-lg border border-slate-800 bg-slate-900/60" />
      ))}
    </div>
  );
}
