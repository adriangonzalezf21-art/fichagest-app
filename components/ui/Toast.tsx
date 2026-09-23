"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from "lucide-react";

type ToastTone = "success" | "error" | "info" | "warning";

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, string> = {
  success: "border-[var(--success)]/30 bg-[var(--surface)] text-[var(--text)]",
  error: "border-[var(--danger)]/30 bg-[var(--surface)] text-[var(--text)]",
  info: "border-[var(--info)]/30 bg-[var(--surface)] text-[var(--text)]",
  warning: "border-[var(--warning)]/30 bg-[var(--surface)] text-[var(--text)]",
};

const toneIcon: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />,
  error: <XCircle className="h-4 w-4 text-[var(--danger)]" />,
  info: <Info className="h-4 w-4 text-[var(--info)]" />,
  warning: <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => [...prev.slice(-4), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 3200);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (m) => toast(m, "success"),
      error: (m) => toast(m, "error"),
      info: (m) => toast(m, "info"),
    }),
    [toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 shadow-[var(--shadow-lg)] ${toneStyles[item.tone]}`}
          >
            <span className="mt-0.5 shrink-0">{toneIcon[item.tone]}</span>
            <p className="flex-1 text-sm leading-snug">{item.message}</p>
            <button
              type="button"
              aria-label="Cerrar notificación"
              className="rounded-[var(--radius-sm)] p-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
              onClick={() => dismiss(item.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: (m: string) => console.info(m),
      success: (m: string) => console.info(m),
      error: (m: string) => console.error(m),
      info: (m: string) => console.info(m),
    } satisfies ToastContextValue;
  }
  return ctx;
}
