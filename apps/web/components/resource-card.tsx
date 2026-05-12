"use client";

type ResourceCardProps = {
  children: React.ReactNode;
  className?: string;
};

export function ResourceCard({ children, className = "" }: ResourceCardProps) {
  return (
    <div className={`rounded-lg border border-slate-800/80 bg-slate-900/80 p-4 shadow-sm shadow-black/10 ${className}`}>
      {children}
    </div>
  );
}
