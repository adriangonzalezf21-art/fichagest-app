import { type ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const tones: Record<Tone, string> = {
  neutral: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]",
  success: "border-[var(--success)]/25 bg-[var(--success-soft)] text-[var(--success)]",
  warning: "border-[var(--warning)]/25 bg-[var(--warning-soft)] text-[var(--warning)]",
  danger: "border-[var(--danger)]/25 bg-[var(--danger-soft)] text-[var(--danger)]",
  info: "border-[var(--info)]/25 bg-[var(--info-soft)] text-[var(--info)]",
  accent: "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-hover)]",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
