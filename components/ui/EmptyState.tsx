import { type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-6 py-12 text-center">
      {icon ? <div className="mb-4 text-[var(--text-muted)]">{icon}</div> : null}
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm text-sm text-[var(--text-secondary)]">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <div className="mt-5">
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function LoadingState({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-sm text-[var(--text-secondary)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
      {label}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-5 text-[var(--danger)]">
      <p className="text-sm">{message}</p>
      {onRetry ? (
        <div className="mt-3">
          <Button variant="danger" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
