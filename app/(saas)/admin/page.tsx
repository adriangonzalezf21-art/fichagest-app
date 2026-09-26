"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  CalendarDays,
  Users,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { canAccessAdminZone } from "@/lib/authz";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfTomorrowISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export default function AdminHomePage() {
  const router = useRouter();
  const { error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);
  const [shiftsToday, setShiftsToday] = useState<number | null>(null);
  const [pendingVacations, setPendingVacations] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);
      if (!sess.session) {
        router.push("/login?next=/admin");
        return;
      }

      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("role, is_owner, company_id")
        .eq("user_id", sess.session.user.id)
        .maybeSingle<{
          role: string | null;
          is_owner: boolean | null;
          company_id: string | null;
        }>();

      if (meErr) throw new Error(meErr.message);
      if (!canAccessAdminZone(me)) {
        throw new Error("No tienes permisos de administración.");
      }
      if (!me?.company_id) {
        throw new Error("Tu usuario no está asociado a una empresa.");
      }

      const companyId = me.company_id;

      const { data: company, error: cErr } = await supabase
        .from("companies")
        .select("id, name")
        .eq("id", companyId)
        .maybeSingle<{ id: string; name: string | null }>();

      if (cErr) throw new Error(cErr.message);
      setCompanyName(company?.name ?? null);

      const { data: workers, error: wErr } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("company_id", companyId);

      if (wErr) throw new Error(wErr.message);
      const workerIds = (workers ?? []).map((w) => w.user_id);
      setEmployeeCount(workerIds.length);

      const { count: shiftCount, error: sErr } = await supabase
        .from("shifts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("started_at", startOfTodayISO())
        .lt("started_at", startOfTomorrowISO());

      if (sErr) throw new Error(sErr.message);
      setShiftsToday(shiftCount ?? 0);

      if (workerIds.length === 0) {
        setPendingVacations(0);
      } else {
        const { count: vacCount, error: vErr } = await supabase
          .from("vacation_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING")
          .in("user_id", workerIds);

        if (vErr) throw new Error(vErr.message);
        setPendingVacations(vacCount ?? 0);
      }
    } catch (e: unknown) {
      const msg = userFacingError(e);
      setErrorMsg(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <PageSkeleton />;

  if (errorMsg) {
    return <ErrorState message={errorMsg} onRetry={() => void load()} />;
  }

  return (
    <div>
      <PageHeader
        title={companyName ? `Inicio · ${companyName}` : "Inicio"}
        description="Resumen de administración de tu empresa"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone="info">Administración</Badge>
        {companyName ? <Badge tone="neutral">{companyName}</Badge> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Empleados"
          value={String(employeeCount ?? "—")}
          sub="Perfiles vinculados a la empresa"
        />
        <StatCard
          title="Fichajes de hoy"
          value={String(shiftsToday ?? "—")}
          sub="Turnos iniciados hoy"
          tone="info"
        />
        <StatCard
          title="Vacaciones pendientes"
          value={String(pendingVacations ?? "—")}
          sub="Solicitudes pendientes de aprobación"
          tone={pendingVacations && pendingVacations > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Link href="/admin/shifts">
          <Card className="transition hover:border-[var(--border-strong)]">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-[var(--text-muted)]" />
              <div>
                <div className="text-sm font-medium text-[var(--text)]">Fichajes</div>
                <div className="text-xs text-[var(--text-muted)]">Ver e exportar turnos</div>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/admin/users">
          <Card className="transition hover:border-[var(--border-strong)]">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-[var(--text-muted)]" />
              <div>
                <div className="text-sm font-medium text-[var(--text)]">Empleados</div>
                <div className="text-xs text-[var(--text-muted)]">Gestionar equipo</div>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/admin/vacations">
          <Card className="transition hover:border-[var(--border-strong)]">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-[var(--text-muted)]" />
              <div>
                <div className="text-sm font-medium text-[var(--text)]">Vacaciones</div>
                <div className="text-xs text-[var(--text-muted)]">Aprobar solicitudes</div>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
