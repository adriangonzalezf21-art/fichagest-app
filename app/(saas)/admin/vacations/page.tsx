"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  RefreshCw,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

type ProfileLite = {
  user_id: string;
  full_name: string | null;
  dni: string | null;
  vacation_days_per_year: number | null;
};

type VacationReq = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  days: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | string;
  note: string | null;
  admin_note: string | null;
  created_at: string;
};

type BalanceRow = {
  user_id: string;
  year: number;
  entitled_days: number;
  carried_over_days: number;
};

function yearOf(dateYYYYMMDD: string) {
  return Number(dateYYYYMMDD.slice(0, 4));
}

function fmt(d: string) {
  return d;
}

function statusBadge(status: string) {
  if (status === "PENDING") return <Badge tone="warning">Pendiente</Badge>;
  if (status === "APPROVED") return <Badge tone="success">Aprobada</Badge>;
  if (status === "REJECTED") return <Badge tone="danger">Rechazada</Badge>;
  if (status === "CANCELLED") return <Badge tone="neutral">Cancelada</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

export default function AdminVacationsPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [workers, setWorkers] = useState<ProfileLite[]>([]);
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({});
  const [dniByUser, setDniByUser] = useState<Record<string, string>>({});

  const [requests, setRequests] = useState<VacationReq[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [adminNoteById, setAdminNoteById] = useState<Record<string, string>>({});

  const [decideTarget, setDecideTarget] = useState<{
    request: VacationReq;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [decideLoading, setDecideLoading] = useState(false);

  const currentYear = new Date().getFullYear();

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);
      if (!sess.session) {
        router.push("/login?next=/admin/vacations");
        return;
      }

      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("role, is_owner, company_id")
        .eq("user_id", sess.session.user.id)
        .maybeSingle<{ role: string | null; is_owner: boolean | null; company_id: string | null }>();

      if (meErr) throw new Error(meErr.message);

      const isAdmin = me?.is_owner === true || (me?.role || "").toLowerCase() === "admin";
      if (!isAdmin) {
        throw new Error("No tienes permisos de admin para ver esta página.");
      }

      if (!me?.company_id) {
        throw new Error("Tu usuario no está asociado a una empresa.");
      }

      const { data: wRows, error: wErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, dni, vacation_days_per_year")
        .eq("company_id", me.company_id)
        .order("full_name", { ascending: true });

      if (wErr) throw new Error(wErr.message);

      const w = (wRows ?? []) as ProfileLite[];
      setWorkers(w);

      const nMap: Record<string, string> = {};
      const dMap: Record<string, string> = {};

      w.forEach((p) => {
        nMap[p.user_id] = p.full_name?.trim() || p.user_id.slice(0, 8);
        dMap[p.user_id] = (p.dni || "").trim();
      });

      setNameByUser(nMap);
      setDniByUser(dMap);

      const workerIds = w.map((x) => x.user_id);

      if (workerIds.length === 0) {
        setRequests([]);
        setBalances([]);
        return;
      }

      const { data: reqRows, error: rErr } = await supabase
        .from("vacation_requests")
        .select("id,user_id,start_date,end_date,days,status,note,admin_note,created_at")
        .in("user_id", workerIds)
        .order("start_date", { ascending: true });

      if (rErr) throw new Error(rErr.message);
      setRequests((reqRows ?? []) as VacationReq[]);

      const { data: balRows, error: bErr } = await supabase
        .from("vacation_balances")
        .select("user_id, year, entitled_days, carried_over_days")
        .eq("year", currentYear)
        .in("user_id", workerIds)
        .order("user_id", { ascending: true });

      if (bErr) throw new Error(bErr.message);
      setBalances((balRows ?? []) as BalanceRow[]);
    } catch (e: any) {
      const msg = userFacingError(e, e?.message ?? "Error inesperado");
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

  const pending = useMemo(() => requests.filter((r) => r.status === "PENDING"), [requests]);
  const approvedCount = useMemo(
    () => requests.filter((r) => r.status === "APPROVED").length,
    [requests]
  );
  const rejectedCount = useMemo(
    () => requests.filter((r) => r.status === "REJECTED").length,
    [requests]
  );

  const visibleRequests = useMemo(() => {
    if (!selectedUserId) return requests;
    return requests.filter((r) => r.user_id === selectedUserId);
  }, [requests, selectedUserId]);

  const approvedTakenByUserThisYear = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of requests) {
      if (r.status !== "APPROVED") continue;
      if (yearOf(r.start_date) !== currentYear) continue;
      acc[r.user_id] = (acc[r.user_id] || 0) + Number(r.days || 0);
    }
    return acc;
  }, [requests, currentYear]);

  const balanceByUser = useMemo(() => {
    const map: Record<string, BalanceRow> = {};
    for (const b of balances) map[b.user_id] = b;
    return map;
  }, [balances]);

  const requestDecide = (r: VacationReq, decision: "APPROVED" | "REJECTED") => {
    setDecideTarget({ request: r, decision });
  };

  const executeDecide = async () => {
    if (!decideTarget) return;

    const { request: r, decision } = decideTarget;
    const admin_note = (adminNoteById[r.id] || "").trim() || null;

    setDecideLoading(true);

    const { error } = await supabase.rpc("decide_vacation_request", {
      p_request_id: r.id,
      p_decision: decision,
      p_admin_note: admin_note,
    });

    setDecideLoading(false);

    if (error) {
      toastError(userFacingError(error));
      return;
    }

    success(decision === "APPROVED" ? "Solicitud aprobada." : "Solicitud rechazada.");
    setDecideTarget(null);
    await load();
  };

  if (loading && requests.length === 0 && workers.length === 0 && !errorMsg) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vacaciones equipo"
        description={`Gestión de solicitudes y saldos · Año ${currentYear}`}
        actions={
          <Button variant="secondary" size="sm" onClick={load} disabled={loading} loading={loading}>
            <RefreshCw className="h-4 w-4" />
            Recargar
          </Button>
        }
      />

      {errorMsg ? <ErrorState message={errorMsg} onRetry={load} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Pendientes"
          value={String(pending.length)}
          tone={pending.length ? "warning" : "default"}
        />
        <StatCard title="Aprobadas" value={String(approvedCount)} tone="success" />
        <StatCard title="Rechazadas" value={String(rejectedCount)} tone="danger" />
      </div>

      <Card>
        <div className="mb-3 text-sm font-semibold text-[var(--text)]">Filtro</div>
        <div className="flex flex-wrap items-end gap-4">
          <FormField label="Trabajador" htmlFor="vac-worker">
            <Select
              id="vac-worker"
              className="min-w-[260px]"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Todos</option>
              {workers.map((w) => (
                <option key={w.user_id} value={w.user_id}>
                  {(w.full_name?.trim() || w.user_id.slice(0, 8)) + (w.dni ? ` (${w.dni})` : "")}
                </option>
              ))}
            </Select>
          </FormField>
          <p className="mb-2.5 text-sm text-[var(--text-secondary)]">
            Mostrando:{" "}
            <span className="font-medium text-[var(--text)]">{visibleRequests.length}</span>{" "}
            solicitudes
          </p>
        </div>
      </Card>

      {/* Pending — prioritized */}
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">Solicitudes pendientes</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              Aprueba o rechaza con nota opcional
            </div>
          </div>
          <Badge tone={pending.length ? "warning" : "neutral"}>{pending.length}</Badge>
        </div>

        {loading ? (
          <PageSkeleton />
        ) : pending.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-8 w-8" />}
            title="No hay solicitudes pendientes"
            description="Cuando un empleado solicite vacaciones, aparecerán aquí."
          />
        ) : (
          <div className="space-y-3">
            {pending.map((r) => {
              const who = nameByUser[r.user_id] || r.user_id.slice(0, 8);
              const dni = dniByUser[r.user_id] || "—";

              return (
                <div
                  key={r.id}
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-4"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={who} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--text)]">{who}</span>
                        <span className="text-xs text-[var(--text-muted)]">({dni})</span>
                        <Badge tone="warning">Pendiente</Badge>
                      </div>
                      <div className="mt-1 text-sm text-[var(--text-secondary)]">
                        {fmt(r.start_date)} → {fmt(r.end_date)} · Días:{" "}
                        <span className="font-medium text-[var(--text)]">
                          {Number(r.days || 0).toFixed(2)}
                        </span>
                      </div>
                      {r.note ? (
                        <div className="mt-1 text-sm text-[var(--text-muted)]">Nota: {r.note}</div>
                      ) : null}

                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                        <FormField label="Nota admin (opcional)" htmlFor={`note-${r.id}`}>
                          <Input
                            id={`note-${r.id}`}
                            placeholder="Nota admin (opcional)"
                            value={adminNoteById[r.id] ?? ""}
                            onChange={(e) =>
                              setAdminNoteById((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                          />
                        </FormField>
                        <div className="flex gap-2 pb-0.5">
                          <Button
                            variant="accent"
                            size="sm"
                            onClick={() => requestDecide(r, "APPROVED")}
                          >
                            <Check className="h-4 w-4" />
                            Aprobar
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => requestDecide(r, "REJECTED")}
                          >
                            <X className="h-4 w-4" />
                            Rechazar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Balances */}
      <Card>
        <div className="mb-4">
          <div className="text-sm font-semibold text-[var(--text)]">
            Saldo vacaciones ({currentYear})
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            Asignados = días anuales + arrastre · Restantes = asignados − consumidos aprobados
          </div>
        </div>

        {workers.length === 0 ? (
          <EmptyState title="No hay trabajadores" description="Invita empleados desde Empleados." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                    <th className="pb-3 pr-4 font-medium">Trabajador</th>
                    <th className="pb-3 pr-4 font-medium">Anuales</th>
                    <th className="pb-3 pr-4 font-medium">Arrastre</th>
                    <th className="pb-3 pr-4 font-medium">Asignados</th>
                    <th className="pb-3 pr-4 font-medium">Consumidos</th>
                    <th className="pb-3 font-medium">Restantes</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => {
                    const b = balanceByUser[w.user_id];
                    const annualDays = Number(w.vacation_days_per_year ?? 30);
                    const carriedOver = Number(b?.carried_over_days ?? 0);
                    const entitled = annualDays + carriedOver;
                    const taken = Number(approvedTakenByUserThisYear[w.user_id] ?? 0);
                    const remaining = entitled - taken;
                    const who = w.full_name?.trim() || w.user_id.slice(0, 8);

                    return (
                      <tr
                        key={w.user_id}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={who} size="sm" />
                            <div>
                              <div className="font-medium text-[var(--text)]">{who}</div>
                              {w.dni ? (
                                <div className="text-xs text-[var(--text-muted)]">{w.dni}</div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-[var(--text-secondary)]">
                          {annualDays.toFixed(2)}
                        </td>
                        <td className="py-3 pr-4 text-[var(--text-secondary)]">
                          {carriedOver.toFixed(2)}
                        </td>
                        <td className="py-3 pr-4 text-[var(--text-secondary)]">
                          {entitled.toFixed(2)}
                        </td>
                        <td className="py-3 pr-4 text-[var(--text-secondary)]">
                          {taken.toFixed(2)}
                        </td>
                        <td className="py-3 font-semibold text-[var(--text)]">
                          {remaining.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {workers.map((w) => {
                const b = balanceByUser[w.user_id];
                const annualDays = Number(w.vacation_days_per_year ?? 30);
                const carriedOver = Number(b?.carried_over_days ?? 0);
                const entitled = annualDays + carriedOver;
                const taken = Number(approvedTakenByUserThisYear[w.user_id] ?? 0);
                const remaining = entitled - taken;
                const who = w.full_name?.trim() || w.user_id.slice(0, 8);

                return (
                  <div
                    key={w.user_id}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={who} size="sm" />
                      <div>
                        <div className="font-semibold text-[var(--text)]">{who}</div>
                        {w.dni ? (
                          <div className="text-xs text-[var(--text-muted)]">{w.dni}</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="text-[var(--text-muted)]">
                        Anuales:{" "}
                        <span className="text-[var(--text)]">{annualDays.toFixed(2)}</span>
                      </div>
                      <div className="text-[var(--text-muted)]">
                        Arrastre:{" "}
                        <span className="text-[var(--text)]">{carriedOver.toFixed(2)}</span>
                      </div>
                      <div className="text-[var(--text-muted)]">
                        Asignados:{" "}
                        <span className="text-[var(--text)]">{entitled.toFixed(2)}</span>
                      </div>
                      <div className="text-[var(--text-muted)]">
                        Consumidos:{" "}
                        <span className="text-[var(--text)]">{taken.toFixed(2)}</span>
                      </div>
                      <div className="col-span-2 font-semibold text-[var(--text)]">
                        Restantes: {remaining.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Los días anuales se editan desde Empleados.
        </p>
      </Card>

      {/* Calendar / list */}
      <Card>
        <div className="mb-4">
          <div className="text-sm font-semibold text-[var(--text)]">Calendario (lista)</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            Todas las solicitudes del filtro actual
          </div>
        </div>

        {loading ? (
          <PageSkeleton />
        ) : visibleRequests.length === 0 ? (
          <EmptyState title="No hay solicitudes" description="No hay registros con este filtro." />
        ) : (
          <div className="space-y-3">
            {visibleRequests.map((r) => {
              const who = nameByUser[r.user_id] || r.user_id.slice(0, 8);

              return (
                <div
                  key={r.id}
                  className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-4"
                >
                  <Avatar name={who} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--text)]">{who}</span>
                      {statusBadge(r.status)}
                    </div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">
                      {fmt(r.start_date)} → {fmt(r.end_date)} · Días:{" "}
                      <span className="font-medium text-[var(--text)]">
                        {Number(r.days || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!decideTarget}
        title={
          decideTarget?.decision === "APPROVED" ? "Aprobar solicitud" : "Rechazar solicitud"
        }
        description={
          decideTarget
            ? decideTarget.decision === "APPROVED"
              ? `¿Aprobar vacaciones de ${nameByUser[decideTarget.request.user_id] || "este trabajador"} (${fmt(decideTarget.request.start_date)} → ${fmt(decideTarget.request.end_date)})?`
              : `¿Rechazar vacaciones de ${nameByUser[decideTarget.request.user_id] || "este trabajador"} (${fmt(decideTarget.request.start_date)} → ${fmt(decideTarget.request.end_date)})?`
            : undefined
        }
        confirmLabel={decideTarget?.decision === "APPROVED" ? "Aprobar" : "Rechazar"}
        danger={decideTarget?.decision === "REJECTED"}
        loading={decideLoading}
        onConfirm={executeDecide}
        onCancel={() => {
          if (!decideLoading) setDecideTarget(null);
        }}
      />
    </div>
  );
}
