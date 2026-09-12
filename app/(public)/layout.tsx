/**
 * Layout for public/auth pages — no AppShell chrome.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">{children}</div>;
}
