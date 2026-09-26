import { type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from "react";

const fieldClass =
  "w-full appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition [color-scheme:dark] focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--accent-soft)]";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClass} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`${fieldClass} cursor-pointer pr-10 ${className}`}
      {...props}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-sm text-[var(--text-secondary)]">{children}</label>;
}
