"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LogOut, Menu, MoreHorizontal, X, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  canAccessAdminZone,
  canAccessOwnerZone,
  type ProfileAuthFields,
} from "@/lib/authz";
import {
  getNavSections,
  homeHrefForProfile,
  isNavItemActive,
  pageTitleFromPath,
  type NavItem,
} from "@/lib/navigation";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { ToastProvider } from "@/components/ui/Toast";

type ShellProps = {
  children: React.ReactNode;
  email: string;
  profile: ProfileAuthFields & { full_name?: string | null };
  companyName?: string | null;
  enableShiftPlanning?: boolean | null;
};

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition ${
        active
          ? "bg-[var(--accent-soft)] text-[var(--text)] shadow-[inset_3px_0_0_0_var(--accent)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
      }`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 transition ${
          active ? "text-[var(--accent-hover)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
        }`}
      />
      <span className="font-medium">{label}</span>
    </Link>
  );
}

function SidebarContent({
  profile,
  email,
  companyName,
  enableShiftPlanning,
  onNavigate,
  onLogout,
}: {
  profile: ShellProps["profile"];
  email: string;
  companyName?: string | null;
  enableShiftPlanning?: boolean | null;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname() || "/app";
  const sections = useMemo(
    () => getNavSections(profile, { enableShiftPlanning, companyName }),
    [profile, enableShiftPlanning, companyName]
  );
  const isOwner = canAccessOwnerZone(profile);
  const homeHref = homeHrefForProfile(profile);

  const displayName = profile.full_name?.trim() || email.split("@")[0] || "Usuario";
  const roleLabel = isOwner
    ? "Owner"
    : canAccessAdminZone(profile)
      ? "Admin"
      : "Trabajador";

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Link href={homeHref} onClick={onNavigate} className="flex items-center gap-3">
          <Image
            src="/icon-192.png"
            alt="Fichagest"
            width={36}
            height={36}
            className="h-9 w-9 rounded-[var(--radius-md)]"
            priority
          />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">
              Ficha<span className="font-extrabold">gest</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">Control horario</div>
          </div>
        </Link>
        {companyName && !isOwner ? (
          <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <Building2 className="h-3.5 w-3.5" />
              Empresa actual
            </div>
            <div className="mt-1 truncate text-sm font-medium text-[var(--text)]">
              {companyName}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mx-5 h-px bg-[var(--border)]" />

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.map((section, index) => (
          <div key={`${section.title}-${index}`} className="space-y-0.5">
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {section.title}
            </div>
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                {...item}
                active={isNavItemActive(pathname, item.href)}
                onClick={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] p-4">
        <div className="mb-3 flex items-center gap-3">
          <Avatar name={displayName} email={email} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[var(--text)]">{displayName}</div>
            <div className="truncate text-[11px] text-[var(--text-muted)]">{email}</div>
          </div>
          <Badge tone="accent">{roleLabel}</Badge>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function ownerBottomItems(sections: ReturnType<typeof getNavSections>): {
  core: NavItem[];
  hasMore: boolean;
} {
  const company = sections[0]?.items ?? [];
  const platform = sections[1]?.items ?? [];
  const core = company.slice(0, 4);
  return { core, hasMore: platform.length > 0 || company.length > 4 };
}

export default function AppShell(props: ShellProps) {
  const { children, email, profile, companyName, enableShiftPlanning } = props;
  const pathname = usePathname() || "/app";
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sections = useMemo(
    () => getNavSections(profile, { enableShiftPlanning, companyName }),
    [profile, enableShiftPlanning, companyName]
  );
  const isOwner = canAccessOwnerZone(profile);

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const title = pageTitleFromPath(pathname);

  const bottomCore = isOwner
    ? ownerBottomItems(sections).core
    : (sections.find((s) => s.title === "Principal")?.items ?? []).filter((i) =>
        ["/app", "/clock", "/history", "/vacations"].includes(i.href)
      );
  const hasMore = isOwner
    ? ownerBottomItems(sections).hasMore
    : sections.some((s) => s.title !== "Principal") ||
      (sections.find((s) => s.title === "Principal")?.items.some((i) => i.href === "/my-schedule") ??
        false);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] border-r border-[var(--border)] bg-[var(--bg-elevated)] lg:block">
          <SidebarContent
            profile={profile}
            email={email}
            companyName={companyName}
            enableShiftPlanning={enableShiftPlanning}
            onLogout={logout}
          />
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              aria-label="Cerrar menú"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-[min(100%,20rem)] border-r border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-semibold">Menú</span>
                <button
                  type="button"
                  className="rounded-[var(--radius-md)] p-2 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Cerrar menú"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarContent
                profile={profile}
                email={email}
                companyName={companyName}
                enableShiftPlanning={enableShiftPlanning}
                onNavigate={() => setMobileOpen(false)}
                onLogout={logout}
              />
            </aside>
          </div>
        ) : null}

        <div className="lg:pl-[var(--sidebar-width)]">
          <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur-xl">
            <div className="flex h-[var(--topbar-height)] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  className="rounded-[var(--radius-md)] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] lg:hidden"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Abrir menú"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--text)] sm:text-base">
                    {title}
                  </div>
                  {isOwner && pathname.startsWith("/owner") ? (
                    <div className="hidden truncate text-xs text-[var(--text-muted)] sm:block">
                      Fichagest · Administración
                    </div>
                  ) : companyName ? (
                    <div className="hidden truncate text-xs text-[var(--text-muted)] sm:block">
                      {companyName}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="hidden items-center gap-3 sm:flex">
                <Avatar name={profile.full_name} email={email} size="sm" />
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:pb-10 lg:px-8">
            {children}
          </main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg-elevated)]/95 backdrop-blur-xl lg:hidden">
          <div
            className={`mx-auto grid max-w-lg gap-1 px-2 py-2 ${
              hasMore ? "grid-cols-5" : "grid-cols-4"
            }`}
          >
            {bottomCore.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-1 rounded-[var(--radius-md)] px-1 py-2 text-[10px] ${
                    active
                      ? "bg-[var(--accent-soft)] text-[var(--accent-hover)]"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate">
                    {item.href === "/history" ? "Historial" : item.label}
                  </span>
                </Link>
              );
            })}
            {hasMore ? (
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="flex flex-col items-center gap-1 rounded-[var(--radius-md)] px-1 py-2 text-[10px] text-[var(--text-muted)]"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span>Más</span>
              </button>
            ) : null}
          </div>
        </nav>
      </div>
    </ToastProvider>
  );
}
