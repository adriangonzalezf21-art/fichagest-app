/**
 * Layout for public/auth pages — no AppShell chrome.
 */
import { ToastProvider } from "@/components/ui/Toast";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="relative min-h-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.12),_transparent_50%),radial-gradient(ellipse_at_bottom_right,_rgba(96,165,250,0.08),_transparent_40%)]"
          aria-hidden
        />
        <div className="relative z-10 min-h-screen">{children}</div>
      </div>
    </ToastProvider>
  );
}
