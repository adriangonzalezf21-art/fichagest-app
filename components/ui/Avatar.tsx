function initialsFrom(name?: string | null, email?: string | null) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function Avatar({
  name,
  email,
  size = "md",
}: {
  name?: string | null;
  email?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "h-8 w-8 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-11 w-11 text-sm",
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-hover)] ${sizes[size]}`}
      aria-hidden
    >
      {initialsFrom(name, email)}
    </span>
  );
}
