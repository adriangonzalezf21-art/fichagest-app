import { type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--text)] text-[#0b1220] hover:opacity-90 shadow-[var(--shadow-sm)]",
  secondary:
    "border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text)] hover:bg-[var(--surface-hover)]",
  ghost: "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]",
  danger:
    "border border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)] hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-[var(--radius-md)]",
  md: "px-4 py-2.5 text-sm rounded-[var(--radius-md)]",
  lg: "px-5 py-3 text-sm rounded-[var(--radius-lg)]",
};

export function Button({
  children,
  className = "",
  variant = "secondary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium transition disabled:opacity-40 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
