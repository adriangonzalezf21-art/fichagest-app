import {
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Clock3,
  Gauge,
  History,
  LayoutDashboard,
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

export function getNavForProfile(
  profile: ProfileAuthFields | null | undefined,
  opts?: { enableShiftPlanning?: boolean | null }
): { primary: NavItem[]; admin: NavItem[]; owner: NavItem[] } {
  const planning = opts?.enableShiftPlanning === true;

  const primary: NavItem[] = [
    { href: "/app", label: "Inicio", icon: LayoutDashboard },
    { href: "/clock", label: "Fichar", icon: Clock3 },
    { href: "/history", label: "Mi historial", icon: History },
    { href: "/vacations", label: "Vacaciones", icon: CalendarDays },
  ];

  if (planning) {
    primary.push({ href: "/my-schedule", label: "Mi horario", icon: CalendarRange });
  }

  const admin: NavItem[] = [];
  if (canAccessAdminZone(profile)) {
    admin.push(
      { href: "/admin/shifts", label: "Fichajes", icon: ClipboardList },
      { href: "/admin/users", label: "Empleados", icon: Users },
      { href: "/admin/vacations", label: "Vacaciones equipo", icon: CalendarDays }
    );
    if (planning) {
      admin.push(
        { href: "/admin/planned-shifts", label: "Planificación", icon: CalendarRange },
        { href: "/admin/planned-vs-real", label: "Plan vs real", icon: Gauge }
      );
    }
  }

  const owner: NavItem[] = [];
  if (canAccessOwnerZone(profile)) {
    owner.push({ href: "/owner/companies", label: "Empresas", icon: Building2 });
  }

  return { primary, admin, owner };
}

export function pageTitleFromPath(pathname: string): string {
  const map: Record<string, string> = {
    "/app": "Inicio",
    "/clock": "Fichar",
    "/history": "Mi historial",
    "/vacations": "Vacaciones",
    "/my-schedule": "Mi horario",
    "/admin/shifts": "Fichajes",
    "/admin/users": "Empleados",
    "/admin/vacations": "Vacaciones equipo",
    "/admin/planned-shifts": "Planificación",
    "/admin/planned-vs-real": "Plan vs real",
    "/owner/companies": "Empresas",
    "/company/shifts": "Turnos empresa",
  };
  if (map[pathname]) return map[pathname];
  for (const [key, label] of Object.entries(map)) {
    if (pathname.startsWith(key)) return label;
  }
  return "Fichagest";
}
