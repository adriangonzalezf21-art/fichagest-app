import {
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Clock3,
  Gauge,
  History,
  LayoutDashboard,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  canAccessAdminZone,
  canAccessOwnerZone,
  type ProfileAuthFields,
} from "@/lib/authz";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (pathname: string) => boolean;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

/**
 * Sidebar sections by role.
 * Owner gets company block (no worker personal links) + Fichagest platform block.
 * Admin/worker keep the previous Principal + Administración layout.
 */
export function getNavSections(
  profile: ProfileAuthFields | null | undefined,
  opts?: {
    enableShiftPlanning?: boolean | null;
    companyName?: string | null;
  }
): NavSection[] {
  const planning = opts?.enableShiftPlanning === true;

  if (canAccessOwnerZone(profile)) {
    const companyTitle = opts?.companyName?.trim() || "Mi empresa";
    return [
      {
        title: companyTitle,
        items: [
          { href: "/admin", label: "Inicio", icon: LayoutDashboard },
          { href: "/admin/shifts", label: "Fichajes", icon: ClipboardList },
          { href: "/admin/users", label: "Empleados", icon: Users },
          { href: "/admin/vacations", label: "Vacaciones", icon: CalendarDays },
        ],
      },
      {
        title: "Fichagest",
        items: [
          { href: "/owner", label: "Panel Owner", icon: Shield },
          { href: "/owner/companies", label: "Empresas", icon: Building2 },
        ],
      },
    ];
  }

  const primary: NavItem[] = [
    { href: "/app", label: "Inicio", icon: LayoutDashboard },
    { href: "/clock", label: "Fichar", icon: Clock3 },
    { href: "/history", label: "Mi historial", icon: History },
    { href: "/vacations", label: "Vacaciones", icon: CalendarDays },
  ];

  if (planning) {
    primary.push({ href: "/my-schedule", label: "Mi horario", icon: CalendarRange });
  }

  const sections: NavSection[] = [{ title: "Principal", items: primary }];

  if (canAccessAdminZone(profile)) {
    const admin: NavItem[] = [
      { href: "/admin/shifts", label: "Fichajes", icon: ClipboardList },
      { href: "/admin/users", label: "Empleados", icon: Users },
      { href: "/admin/vacations", label: "Vacaciones equipo", icon: CalendarDays },
    ];
    if (planning) {
      admin.push(
        { href: "/admin/planned-shifts", label: "Planificación", icon: CalendarRange },
        { href: "/admin/planned-vs-real", label: "Plan vs real", icon: Gauge }
      );
    }
    sections.push({ title: "Administración", items: admin });
  }

  return sections;
}

/** @deprecated Prefer getNavSections — kept for any residual callers. */
export function getNavForProfile(
  profile: ProfileAuthFields | null | undefined,
  opts?: { enableShiftPlanning?: boolean | null; companyName?: string | null }
): { primary: NavItem[]; admin: NavItem[]; owner: NavItem[] } {
  const sections = getNavSections(profile, opts);
  if (canAccessOwnerZone(profile)) {
    return {
      primary: [],
      admin: sections[0]?.items ?? [],
      owner: sections[1]?.items ?? [],
    };
  }
  return {
    primary: sections.find((s) => s.title === "Principal")?.items ?? [],
    admin: sections.find((s) => s.title === "Administración")?.items ?? [],
    owner: [],
  };
}

export function isNavItemActive(pathname: string, href: string): boolean {
  // Exact match for section homes so /admin does not highlight under /admin/shifts.
  if (href === "/app" || href === "/admin" || href === "/owner") {
    return pathname === href;
  }
  return pathname.startsWith(href);
}

export function pageTitleFromPath(pathname: string): string {
  const map: Record<string, string> = {
    "/app": "Inicio",
    "/clock": "Fichar",
    "/history": "Mi historial",
    "/vacations": "Vacaciones",
    "/my-schedule": "Mi horario",
    "/admin": "Inicio",
    "/admin/shifts": "Fichajes",
    "/admin/users": "Empleados",
    "/admin/vacations": "Vacaciones equipo",
    "/admin/planned-shifts": "Planificación",
    "/admin/planned-vs-real": "Plan vs real",
    "/owner": "Panel Owner",
    "/owner/companies": "Empresas",
    "/company/shifts": "Turnos empresa",
  };
  if (map[pathname]) return map[pathname];
  for (const [key, label] of Object.entries(map)) {
    if (key !== "/admin" && key !== "/owner" && pathname.startsWith(key)) return label;
  }
  return "Fichagest";
}

export function homeHrefForProfile(profile: ProfileAuthFields | null | undefined): string {
  if (canAccessOwnerZone(profile)) return "/owner";
  return "/app";
}
