"use client";

/**
 * LEGACY: ruta antigua de turnos de empresa.
 * La UI activa está en /admin/shifts. Se mantiene por compatibilidad de enlaces.
 * No eliminar sin confirmar que no hay bookmarks/externos apuntando aquí.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { canAccessAdminZone } from "@/lib/authz";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { userFacingError } from "@/lib/userFacingError";

type Shift = {
  id: string;
  user_id: string;
  company_id: string;
  started_at: string;
  ended_at: string | null;
};

type MeProfile = {
  role: string;
  company_id: string | null;
  is_owner?: boolean | null;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  role: string | null;
};

function msToHHMM(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function CompanyShiftsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    // 1) sesión
    const { data: sess } = await supabase.auth.getSession();
    const session = sess.session;
    if (!session) {
      router.push("/login?next=/company/shifts");
      return;
    }

    const uid = session.user.id;

    // 2) validar admin
    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("role, company_id, is_owner")
      .eq("user_id", uid)
      .maybeSingle<MeProfile>();

    if (meErr) {
      setErrorMsg(userFacingError(meErr));
      setLoading(false);
      return;
    }

    if (!me || !canAccessAdminZone(me)) {
      router.push("/app");
      return;
    }

    if (!me.company_id) {
      setErrorMsg("Tu perfil admin no tiene company_id.");
      setLoading(false);
      return;
    }

    setCompanyId(me.company_id);

    // 3) cargar shifts de la empresa
    const { data: sRows, error: sErr } = await supabase
      .from("shifts")
      .select("id, user_id, company_id, started_at, ended_at")
      .eq("company_id", me.company_id)
      .order("started_at", { ascending: false })
      .limit(300);

    if (sErr) {
      setErrorMsg(userFacingError(sErr));
      setLoading(false);
      return;
    }

    const list = (sRows ?? []) as Shift[];
    setShifts(list);

    // 4) cargar nombres de usuarios (profiles)
    const userIds = Array.from(new Set(list.map((x) => x.user_id)));
    if (userIds.length > 0) {
      const { data: pRows, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, role")
        .in("user_id", userIds);

      if (pErr) {
        console.error(pErr);
      } else {
        const map: Record<string, string> = {};
        (pRows as ProfileRow[] | null)?.forEach((p) => {
          map[p.user_id] = p.full_name?.trim() || p.user_id.slice(0, 8);
        });
        setNameByUser(map);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const countInCourse = useMemo(() => shifts.filter((s) => !s.ended_at).length, [shifts]);

  if (loading && shifts.length === 0 && !errorMsg) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Turnos de la empresa"
        description="Vista legacy · usa Admin → Fichajes para el detalle completo"
        actions={
          <>
            <Link href="/admin/shifts">
              <Button variant="secondary" size="sm">
                Ir a fichajes
              </Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Recargar
            </Button>
          </>
        }
      />

      {errorMsg ? <ErrorState message={errorMsg} onRetry={load} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Empresa" value={companyId ? "Vinculada" : "—"} />
        <StatCard title="En curso" value={String(countInCourse)} tone="info" />
        <StatCard title="Mostrados" value={String(shifts.length)} />
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Cargando…</p>
      ) : shifts.length === 0 ? (
        <EmptyState title="Sin turnos" description="Aún no hay turnos registrados." />
      ) : (
        <div className="space-y-3">
          {shifts.map((s) => {
            const start = new Date(s.started_at);
            const end = s.ended_at ? new Date(s.ended_at) : null;
            const dur = end ? msToHHMM(end.getTime() - start.getTime()) : "—";
            const who = nameByUser[s.user_id] || s.user_id.slice(0, 8);

            return (
              <Card key={s.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-[var(--text)]">{who}</div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">
                      {start.toLocaleString("es-ES")} →{" "}
                      {end ? end.toLocaleString("es-ES") : "En curso"}
                    </div>
                    <div className="mt-1 text-sm text-[var(--text-muted)]">Duración: {dur}</div>
                  </div>
                  {end ? (
                    <Badge tone="neutral">Cerrado</Badge>
                  ) : (
                    <Badge tone="info">En curso</Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
