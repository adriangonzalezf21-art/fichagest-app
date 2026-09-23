"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { canAccessAdminZone } from "@/lib/authz";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

type Row = {
  planned_shift_id: string;
  planned_date: string;
  planned_start: string;
  planned_end: string;
  started_at: string | null;
  ended_at: string | null;
  late_minutes: number | null;
  early_entry_minutes: number | null;
  extra_minutes: number | null;
  early_leave_minutes: number | null;
  status: string;
  user_id: string;
  company_id?: string | null;
};

type Worker = {
  user_id: string;
  full_name: string | null;
};

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function statusLabel(status: string) {
  if (status === "HORAS_EXTRA") return "TIEMPO ADICIONAL";
  if (status === "TARDE") return "RETRASO";
  return status.replaceAll("_", " ");
}

function statusTone(
  status: string
): "success" | "warning" | "danger" | "info" | "neutral" | "accent" {
  switch (status) {
    case "OK":
      return "success";
    case "TARDE":
      return "warning";
    case "ENTRADA_ANTICIPADA":
    case "HORAS_EXTRA":
      return "info";
    case "ABIERTO":
    case "TURNO_INCOMPLETO":
    case "SALIDA_ANTICIPADA":
      return "warning";
    case "NO_FICHAJE":
    case "FUERA_DE_TURNO":
      return "danger";
    default:
      return "neutral";
  }
}

function formatTime(iso: string | null) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PlannedVsRealPage() {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(todayYYYYMMDD());
  const [dateTo, setDateTo] = useState(todayYYYYMMDD());
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const workerName = (id: string) => {
    return workers.find((w) => w.user_id === id)?.full_name || id.slice(0, 8);
  };

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: sess } = await supabase.auth.getSession();

      if (!sess.session) {
        router.push("/login?next=/admin/planned-vs-real");
        return;
      }

      const userId = sess.session.user.id;

      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("company_id, role, is_owner")
        .eq("user_id", userId)
        .maybeSingle<{
          company_id: string | null;
          role: string | null;
          is_owner: boolean | null;
        }>();

      if (meErr) throw new Error(meErr.message);

      if (!canAccessAdminZone(me)) {
        router.push("/app");
        return;
      }

      if (!me?.company_id) {
        throw new Error("No hay empresa.");
      }

      const companyId = me.company_id;

      const { data: workerRows } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("company_id", companyId)
        .order("full_name", { ascending: true });

      setWorkers(workerRows || []);

      // company_id siempre desde el perfil autenticado (nunca desde URL/UI).
      let query = supabase
        .from("shift_plan_vs_real")
        .select("*")
        .eq("company_id", companyId)
        .gte("planned_date", dateFrom)
        .lte("planned_date", dateTo)
        .order("planned_date", { ascending: false });

      if (selectedUserId) query = query.eq("user_id", selectedUserId);
      if (selectedStatus) query = query.eq("status", selectedStatus);

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      setRows(
        ((data || []) as Row[]).filter((r) => {
          if (r.company_id != null && r.company_id !== companyId) return false;
          return true;
        })
      );
    } catch (e: unknown) {
      const msg = userFacingError(e);
      setErrorMsg(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      incidences: rows.filter((r) => r.status !== "OK").length,
      late: rows.filter((r) => r.status === "TARDE").length,
      noClock: rows.filter((r) => r.status === "NO_FICHAJE").length,
      early: rows.filter((r) => r.status === "SALIDA_ANTICIPADA").length,
      outOfShift: rows.filter((r) => r.status === "FUERA_DE_TURNO").length,
      open: rows.filter((r) => r.status === "ABIERTO").length,
      incomplete: rows.filter((r) => r.status === "TURNO_INCOMPLETO").length,
      earlyEntry: rows.filter((r) => r.status === "ENTRADA_ANTICIPADA").length,
      additional: rows.filter((r) => r.status === "HORAS_EXTRA").length,
    };
  }, [rows]);

  const renderDetail = (r: Row) => (
    <>
      {r.late_minutes !== null && r.late_minutes > 0 && (
        <div className="text-sm text-[var(--warning)]">Retraso: {r.late_minutes} min</div>
      )}
      {r.early_entry_minutes !== null && r.early_entry_minutes > 0 && (
        <div className="text-sm text-[var(--info)]">
          Entrada anticipada: {r.early_entry_minutes} min
        </div>
      )}
      {r.early_leave_minutes !== null && r.early_leave_minutes > 0 && (
        <div className="text-sm text-[var(--warning)]">
          Salida anticipada: {r.early_leave_minutes} min
        </div>
      )}
      {r.extra_minutes !== null && r.extra_minutes > 0 && (
        <div className="text-sm text-[var(--info)]">
          Tiempo adicional: {r.extra_minutes} min
        </div>
      )}
    </>
  );

  if (loading && rows.length === 0 && !errorMsg) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Planificado vs real"
        description="Comparación entre turnos planificados y fichajes reales"
        actions={
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Recargar
          </Button>
        }
      />

      {errorMsg ? <ErrorState message={errorMsg} onRetry={load} /> : null}

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-[var(--text)]">Filtros</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <FormField label="Desde" htmlFor="pv-from">
            <Input
              id="pv-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </FormField>
          <FormField label="Hasta" htmlFor="pv-to">
            <Input
              id="pv-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </FormField>
          <FormField label="Trabajador" htmlFor="pv-user">
            <Select
              id="pv-user"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Todos</option>
              {workers.map((w) => (
                <option key={w.user_id} value={w.user_id}>
                  {w.full_name || w.user_id.slice(0, 8)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Estado" htmlFor="pv-status">
            <Select
              id="pv-status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="OK">OK</option>
              <option value="TARDE">Retraso</option>
              <option value="ENTRADA_ANTICIPADA">Entrada anticipada</option>
              <option value="ABIERTO">En curso</option>
              <option value="TURNO_INCOMPLETO">Turno incompleto</option>
              <option value="NO_FICHAJE">Sin fichaje</option>
              <option value="SALIDA_ANTICIPADA">Salida anticipada</option>
              <option value="FUERA_DE_TURNO">Fuera de turno</option>
              <option value="HORAS_EXTRA">Tiempo adicional</option>
            </Select>
          </FormField>
          <Button
            variant="primary"
            onClick={load}
            disabled={loading || !dateFrom || !dateTo}
          >
            Aplicar
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total" value={String(summary.total)} />
        <StatCard title="Incidencias" value={String(summary.incidences)} tone="warning" />
        <StatCard title="Sin fichaje" value={String(summary.noClock)} tone="danger" />
        <StatCard title="Retrasos" value={String(summary.late)} tone="warning" />
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="No hay datos con estos filtros."
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-x-auto md:block" padding={false}>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                  <th className="px-5 py-3 font-medium">Trabajador</th>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Planificado</th>
                  <th className="px-5 py-3 font-medium">Real</th>
                  <th className="px-5 py-3 font-medium">Detalle</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.planned_shift_id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-5 py-3 font-medium text-[var(--text)]">
                      {workerName(r.user_id)}
                    </td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">{r.planned_date}</td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">
                      {r.planned_start.slice(0, 5)} – {r.planned_end.slice(0, 5)}
                    </td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">
                      {formatTime(r.started_at)} – {formatTime(r.ended_at)}
                    </td>
                    <td className="px-5 py-3 space-y-0.5">{renderDetail(r)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <Card key={r.planned_shift_id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-[var(--text)]">{workerName(r.user_id)}</div>
                    <div className="mt-1 text-sm text-[var(--text-muted)]">{r.planned_date}</div>
                  </div>
                  <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                </div>
                <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                  <div>
                    Planificado:{" "}
                    <span className="text-[var(--text)]">
                      {r.planned_start.slice(0, 5)} – {r.planned_end.slice(0, 5)}
                    </span>
                  </div>
                  <div>
                    Real:{" "}
                    <span className="text-[var(--text)]">
                      {formatTime(r.started_at)} – {formatTime(r.ended_at)}
                    </span>
                  </div>
                </div>
                <div className="mt-2 space-y-0.5">{renderDetail(r)}</div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
