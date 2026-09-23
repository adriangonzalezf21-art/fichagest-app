import { type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg" | "xl";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--text)] text-[#0b1220] hover:opacity-90 shadow-[var(--shadow-sm)]",
  accent:
    "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-[var(--shadow-sm)]",
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
  xl: "px-6 py-4 text-base rounded-[var(--radius-xl)]",
};

export function Button({
  children,
  className = "",
  variant = "secondary",
  size = "md",
  loading = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-40 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={Boolean(props.disabled) || loading}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}
