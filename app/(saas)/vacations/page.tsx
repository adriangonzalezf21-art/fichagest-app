"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getMyCompanyAccess } from "@/lib/companyAccess";
import CompanyBlocked from "@/components/CompanyBlocked";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

type VacationRow = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  days: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | string;
  note: string | null;
  admin_note: string | null;
  created_at: string;
  company_id?: string | null;
};

function fmt(d: string) {
  return d;
}

function statusBadge(status: string) {
  switch (status) {
    case "PENDING":
      return <Badge tone="warning">Pendiente</Badge>;
    case "APPROVED":
      return <Badge tone="success">Aprobada</Badge>;
    case "REJECTED":
      return <Badge tone="danger">Rechazada</Badge>;
    case "CANCELLED":
      return <Badge tone="neutral">Cancelada</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}

function formatDisplayDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return fmt(isoDate);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function VacationsPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [rows, setRows] = useState<VacationRow[]>([]);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [requestOpen, setRequestOpen] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<VacationRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const access = await getMyCompanyAccess();

      if (!access.session) {
        router.push("/login?next=/vacations");
        return;
      }

      if (access.blocked) {
        setBlocked(true);
        setRows([]);
        return;
      }

      setBlocked(false);

      const uid = access.session.user.id;

      // Solo las vacaciones del usuario autenticado (defense-in-depth; no depender solo de RLS).
      const { data, error } = await supabase
        .from("vacation_calendar")
        .select("id,user_id,start_date,end_date,days,status,note,admin_note,created_at")
        .eq("user_id", uid)
        .order("start_date", { ascending: true });

      if (error) throw new Error(error.message);

      setRows(((data ?? []) as VacationRow[]).filter((r) => r.user_id === uid));
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
        router.push("/login?next=/vacations");
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

  const openRequestModal = () => {
    setFormError(null);
    setRequestOpen(true);
  };

  const closeRequestModal = () => {
    if (submitting) return;
    setRequestOpen(false);
    setConfirmSubmitOpen(false);
    setFormError(null);
  };

  const requestSubmit = () => {
    setFormError(null);

    if (!startDate || !endDate) {
      setFormError("Selecciona fecha de inicio y fin.");
      toastError("Selecciona fecha de inicio y fin.");
      return;
    }

    if (endDate < startDate) {
      setFormError("La fecha fin no puede ser anterior a la de inicio.");
      toastError("La fecha fin no puede ser anterior a la de inicio.");
      return;
    }

    setConfirmSubmitOpen(true);
  };

  const submit = async () => {
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const access = await getMyCompanyAccess();
      if (access.blocked) {
        setBlocked(true);
        return;
      }

      const { error } = await supabase.rpc("create_vacation_request", {
        p_start: startDate,
        p_end: endDate,
        p_note: note?.trim() || null,
      });

      if (error) {
        toastError(userFacingError(error));
        return;
      }

      setStartDate("");
      setEndDate("");
      setNote("");
      setConfirmSubmitOpen(false);
      setRequestOpen(false);
      await load();
      success("Solicitud enviada correctamente.");
    } catch (e: unknown) {
      toastError(userFacingError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async (r: VacationRow) => {
    if (r.status !== "PENDING") {
      toastError("Solo puedes cancelar solicitudes pendientes.");
      return;
    }

    const access = await getMyCompanyAccess();
    if (!access.session) {
      router.push("/login?next=/vacations");
      return;
    }

    if (access.blocked) {
      setBlocked(true);
      return;
    }

    const uid = access.session.user.id;
    if (r.user_id !== uid) {
      toastError("No puedes cancelar solicitudes de otro usuario.");
      return;
    }

    setCancelling(true);

    try {
      // Defensa: id + user_id (+ status). No cancelar ajenas aunque se manipule el id.
      // company_id se aplica si el acceso lo conoce; la tabla puede no exponerlo en todas las installs.
      let query = supabase
        .from("vacation_requests")
        .update({ status: "CANCELLED" })
        .eq("id", r.id)
        .eq("user_id", uid)
        .eq("status", "PENDING");

      if (access.companyId) {
        query = query.eq("company_id", access.companyId);
      }

      const { error, data } = await query.select("id");

      if (error) {
        // Si company_id no existe en la tabla, reintentar sin ese filtro.
        if (access.companyId && /company_id/i.test(error.message)) {
          const retry = await supabase
            .from("vacation_requests")
            .update({ status: "CANCELLED" })
            .eq("id", r.id)
            .eq("user_id", uid)
            .eq("status", "PENDING")
            .select("id");

          if (retry.error) {
            toastError(userFacingError(retry.error));
            return;
          }
          if (!retry.data?.length) {
            toastError(
              "No se pudo cancelar la solicitud (sin permiso o ya no está pendiente)."
            );
            return;
          }
        } else {
          toastError(userFacingError(error));
          return;
        }
      } else if (!data?.length) {
        toastError(
          "No se pudo cancelar la solicitud (sin permiso o ya no está pendiente)."
        );
        return;
      }

      setCancelTarget(null);
      await load();
      success("Solicitud cancelada.");
    } catch (e: unknown) {
      toastError(userFacingError(e));
    } finally {
      setCancelling(false);
    }
  };

  const pendingCount = useMemo(() => rows.filter((r) => r.status === "PENDING").length, [rows]);
  const approvedCount = useMemo(() => rows.filter((r) => r.status === "APPROVED").length, [rows]);
  const totalDays = useMemo(
    () =>
      rows
        .filter((r) => r.status === "APPROVED" || r.status === "PENDING")
        .reduce((acc, r) => acc + Number(r.days || 0), 0),
    [rows]
  );

  if (blocked) {
    return <CompanyBlocked />;
  }

  if (loading && rows.length === 0 && !errorMsg) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Mis vacaciones"
        description="Solicita periodos de descanso y consulta el estado de tus peticiones."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            <Button variant="primary" size="sm" onClick={openRequestModal}>
              <Plus className="h-4 w-4" />
              Solicitar vacaciones
            </Button>
          </>
        }
      />

      {errorMsg ? <ErrorState message={errorMsg} onRetry={load} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Pendientes" value={String(pendingCount)} tone="warning" />
        <StatCard title="Aprobadas" value={String(approvedCount)} tone="success" />
        <StatCard
          title="Días solicitados"
          value={totalDays.toFixed(2)}
          sub="Pendientes y aprobadas"
        />
      </div>

      {loading && rows.length === 0 ? (
        <PageSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" />}
          title="No hay solicitudes todavía"
          description="Crea tu primera solicitud de vacaciones indicando el periodo deseado."
          actionLabel="Solicitar vacaciones"
          onAction={openRequestModal}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--text)] sm:text-base">
                      {formatDisplayDate(r.start_date)} → {formatDisplayDate(r.end_date)}
                    </h3>
                    {statusBadge(r.status)}
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Días:{" "}
                    <span className="font-medium text-[var(--text)]">
                      {Number(r.days || 0).toFixed(2)}
                    </span>
                    <span className="text-[var(--text-muted)]"> · naturales</span>
                  </p>
                  {(r.note || r.admin_note) && (
                    <div className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                      {r.note ? (
                        <p>
                          <span className="text-[var(--text-muted)]">Tu nota:</span> {r.note}
                        </p>
                      ) : null}
                      {r.admin_note ? (
                        <p>
                          <span className="text-[var(--text-muted)]">Nota admin:</span>{" "}
                          {r.admin_note}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                {r.status === "PENDING" ? (
                  <Button
                    variant="danger"
                    size="sm"
                    className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                    onClick={() => setCancelTarget(r)}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={requestOpen} title="Solicitar vacaciones" onClose={closeRequestModal}>
        <div className="space-y-4">
          <FormField label="Fecha de inicio" htmlFor="vac-start" error={formError && !startDate ? formError : null}>
            <Input
              id="vac-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </FormField>
          <FormField
            label="Fecha de fin"
            htmlFor="vac-end"
            error={
              formError && startDate && (!endDate || endDate < startDate) ? formError : null
            }
          >
            <Input
              id="vac-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </FormField>
          <FormField label="Nota (opcional)" htmlFor="vac-note" hint="Cálculo por días naturales (incluye fines de semana).">
            <Input
              id="vac-note"
              placeholder="Ej.: viaje o asuntos personales"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
          {formError && startDate && endDate && endDate >= startDate ? (
            <p className="text-xs text-[var(--danger)]">{formError}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeRequestModal} disabled={submitting}>
              Cerrar
            </Button>
            <Button variant="primary" onClick={requestSubmit} disabled={submitting}>
              Continuar
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmSubmitOpen}
        title="¿Enviar solicitud de vacaciones?"
        description={
          startDate && endDate
            ? `Periodo del ${formatDisplayDate(startDate)} al ${formatDisplayDate(endDate)}.`
            : undefined
        }
        confirmLabel="Enviar solicitud"
        cancelLabel="Volver"
        loading={submitting}
        onConfirm={submit}
        onCancel={() => {
          if (!submitting) setConfirmSubmitOpen(false);
        }}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        title="¿Cancelar esta solicitud?"
        description={
          cancelTarget
            ? `Se cancelará el periodo del ${formatDisplayDate(cancelTarget.start_date)} al ${formatDisplayDate(cancelTarget.end_date)}.`
            : undefined
        }
        confirmLabel="Cancelar solicitud"
        cancelLabel="Mantener"
        danger
        loading={cancelling}
        onConfirm={() => {
          if (cancelTarget) void cancelRequest(cancelTarget);
        }}
        onCancel={() => {
          if (!cancelling) setCancelTarget(null);
        }}
      />
    </div>
  );
}
