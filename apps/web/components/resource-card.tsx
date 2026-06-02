"use client";

type ResourceCardProps = {
  children: React.ReactNode;
  className?: string;
};

export function ResourceCard({ children, className = "" }: ResourceCardProps) {
  return (
    <div className={`rounded-none border-2 border-border-base bg-surface-card p-6 shadow-brutal transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-brutal-sm ${className}`}>
      {children}
    </div>
  );
}
