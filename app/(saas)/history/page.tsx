"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock3, History, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getMyCompanyAccess } from "@/lib/companyAccess";
import CompanyBlocked from "@/components/CompanyBlocked";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

type Shift = {
  id: string;
  started_at: string;
  ended_at: string | null;
};

function msToHHMM(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSameMonth(d: Date, ref: Date) {
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function HistoryPage() {
  const router = useRouter();
  const { error: toastError } = useToast();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const access = await getMyCompanyAccess();

      if (!access.session) {
        router.push("/login?next=/history");
        return;
      }

      if (access.blocked) {
        setBlocked(true);
        setShifts([]);
        return;
      }

      setBlocked(false);

      const { data, error } = await supabase
        .from("shifts")
        .select("id, started_at, ended_at")
        .eq("user_id", access.session.user.id)
        .order("started_at", { ascending: false })
        .limit(50);

      if (error) {
        const msg = userFacingError(error);
        setErrorMsg(msg);
        toastError(msg);
        return;
      }

      setShifts((data ?? []) as Shift[]);
    } catch (e: unknown) {
      const msg = userFacingError(e);
      setErrorMsg(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const access = await getMyCompanyAccess();

      if (!access.session) {
        router.push("/login?next=/history");
        return;
      }

      if (access.blocked) {
        setBlocked(true);
        setLoading(false);
        return;
      }

      await load();
    };

    init();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const summary = useMemo(() => {
    const now = new Date();
    let monthMs = 0;
    const daysWithClosed = new Set<string>();

    for (const s of shifts) {
      if (!s.ended_at) continue;
      const start = new Date(s.started_at);
      if (!isSameMonth(start, now)) continue;
      const end = new Date(s.ended_at);
      monthMs += Math.max(0, end.getTime() - start.getTime());
      daysWithClosed.add(ymdLocal(start));
    }

    const jornadas = shifts.length;
    const mediaDiaria =
      daysWithClosed.size > 0 ? msToHHMM(monthMs / daysWithClosed.size) : null;

    return {
      hoursMonth: msToHHMM(monthMs),
      jornadas,
      mediaDiaria,
    };
  }, [shifts]);

  if (blocked) {
    return <CompanyBlocked />;
  }

  if (loading && shifts.length === 0 && !errorMsg) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Mi historial"
        description="Consulta tus jornadas y horas registradas"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            <Link href="/clock">
              <Button variant="primary" size="sm">
                <Clock3 className="h-4 w-4" />
                Ir a fichar
              </Button>
            </Link>
          </>
        }
      />

      {errorMsg ? <ErrorState message={errorMsg} onRetry={load} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Horas este mes"
          value={summary.hoursMonth}
          sub="Jornadas cerradas del mes"
          tone="info"
        />
        <StatCard
          title="Jornadas"
          value={String(summary.jornadas)}
          sub="Últimos 50 registros"
        />
        <StatCard
          title="Media diaria"
          value={summary.mediaDiaria ?? "—"}
          sub={summary.mediaDiaria ? "Sobre días con jornada cerrada" : "Sin jornadas cerradas este mes"}
        />
      </div>

      {loading && shifts.length === 0 ? (
        <PageSkeleton />
      ) : shifts.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          title="Sin jornadas registradas"
          description="Cuando fiches tu primera entrada, aparecerá aquí el historial de turnos."
          actionLabel="Ir a fichar"
          onAction={() => router.push("/clock")}
        />
      ) : (
        <Card padding={false}>
          {/* Desktop table-like list */}
          <div className="hidden md:block">
            <div className="grid grid-cols-[1.4fr_1fr_1fr_0.9fr_0.9fr] gap-3 border-b border-[var(--border)] px-5 py-3 text-xs font-medium text-[var(--text-muted)]">
              <div>Fecha</div>
              <div>Entrada</div>
              <div>Salida</div>
              <div>Duración</div>
              <div>Estado</div>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {shifts.map((s) => {
                const start = new Date(s.started_at);
                const end = s.ended_at ? new Date(s.ended_at) : null;
                const inProgress = !end;
                const dur = end
                  ? msToHHMM(end.getTime() - start.getTime())
                  : "EN CURSO";

                return (
                  <li
                    key={s.id}
                    className="grid grid-cols-[1.4fr_1fr_1fr_0.9fr_0.9fr] items-center gap-3 px-5 py-3.5 text-sm"
                  >
                    <div className="font-medium capitalize text-[var(--text)]">
                      {formatDate(start)}
                    </div>
                    <div className="text-[var(--text-secondary)]">{formatTime(start)}</div>
                    <div className="text-[var(--text-secondary)]">
                      {end ? formatTime(end) : "—"}
                    </div>
                    <div className="tabular-nums text-[var(--text)]">{dur}</div>
                    <div>
                      {inProgress ? (
                        <Badge tone="warning">En curso</Badge>
                      ) : (
                        <Badge tone="success">Completa</Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Mobile compact cards */}
          <ul className="divide-y divide-[var(--border)] md:hidden">
            {shifts.map((s) => {
              const start = new Date(s.started_at);
              const end = s.ended_at ? new Date(s.ended_at) : null;
              const inProgress = !end;
              const dur = end
                ? msToHHMM(end.getTime() - start.getTime())
                : "EN CURSO";

              return (
                <li key={s.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium capitalize text-[var(--text)]">
                        {formatDate(start)}
                      </div>
                      <div className="mt-1 text-sm text-[var(--text-secondary)]">
                        {formatTime(start)}
                        {" → "}
                        {end ? formatTime(end) : "En curso"}
                      </div>
                    </div>
                    {inProgress ? (
                      <Badge tone="warning">En curso</Badge>
                    ) : (
                      <Badge tone="success">Completa</Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Duración</span>
                    <span className="tabular-nums font-medium text-[var(--text)]">{dur}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
