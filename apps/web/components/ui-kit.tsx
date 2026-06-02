"use client";

import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const controlClass =
  "w-full rounded-none border-2 border-border-base bg-surface-card px-4 py-3 text-white placeholder-ink-subtle transition-colors focus:border-primary focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60";

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
      <span className="mb-2 block text-xs font-semibold text-ink-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "error" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500 bg-emerald-950 text-emerald-400"
      : tone === "error"
        ? "border-rose-500 bg-rose-950 text-rose-400"
        : "border-accent bg-surface-card text-ink-muted";
  return <div className={cx("rounded-none border-2 px-4 py-3 text-sm font-medium shadow-brutal-sm", toneClass)}>{children}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-none border-2 border-dashed border-border-faint bg-surface-card px-5 py-8 text-center">
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-ink-faint">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "info" | "warning" | "danger" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500 text-emerald-400"
      : tone === "info"
        ? "border-sky-500 text-sky-400"
        : tone === "warning"
          ? "border-amber-500 text-amber-400"
          : tone === "danger"
            ? "border-rose-500 text-rose-400"
            : "border-border-faint text-ink-subtle";
  return <span className={cx("inline-flex rounded-none border-2 px-2 py-0.5 text-xs font-semibold bg-surface-base", toneClass)}>{children}</span>;
}

export function PageActions({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">{children}</div>;
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-none border-2 border-border-base bg-surface-card" />
      ))}
    </div>
  );
}
