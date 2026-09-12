import { type ReactNode } from "react";

export function Card({
  children,
  className = "",
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] ${
        padding ? "p-5 sm:p-6" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  title,
  value,
  sub,
  tone = "default",
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    default: "text-[var(--text)]",
    success: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
    danger: "text-[var(--danger)]",
    info: "text-[var(--info)]",
  };

  return (
    <Card>
      <div className="text-xs text-[var(--text-muted)]">{title}</div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight ${tones[tone]}`}>{value}</div>
      {sub ? <div className="mt-2 text-xs text-[var(--text-secondary)]">{sub}</div> : null}
    </Card>
  );
}
