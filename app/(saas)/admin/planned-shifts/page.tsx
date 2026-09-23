"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

type WorkerRow = {
  user_id: string;
  full_name: string | null;
  dni: string | null;
};

type PlannedShiftRow = {
  id: string;
  company_id: string;
  user_id: string;
  planned_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type EditingRow = {
  user_id: string;
  planned_date: string;
  start_time: string;
  end_time: string;
  notes: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateToYYYYMMDD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayYYYYMMDD() {
  return dateToYYYYMMDD(new Date());
}

function addDaysYYYYMMDD(dateYYYYMMDD: string, days: number) {
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return dateToYYYYMMDD(date);
}

function getWeekKey(dateYYYYMMDD: string) {
  const [year, month, day] = dateYYYYMMDD.split("-").map(Number);
  const d = new Date(year, month - 1, day);

  let weekDay = d.getDay();
  if (weekDay === 0) weekDay = 7;

  d.setDate(d.getDate() - (weekDay - 1));

  return dateToYYYYMMDD(d);
}

function minutesBetween(start: string, end: string) {
  const [sh, sm] = start.slice(0, 5).split(":").map(Number);
  const [eh, em] = end.slice(0, 5).split(":").map(Number);

  const startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;

  if (endMin <= startMin) {
    endMin += 24 * 60;
  }

  return endMin - startMin;
}

function timeToMinutes(time: string) {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function intervalForShift(date: string, start: string, end: string) {
  const startAbs = timeToMinutes(start);
  let endAbs = timeToMinutes(end);

  if (endAbs <= startAbs) {
    endAbs += 24 * 60;
  }

  return { date, startAbs, endAbs };
}

function shiftsOverlap(
  a: { startAbs: number; endAbs: number },
  b: { startAbs: number; endAbs: number }
) {
  return a.startAbs < b.endAbs && b.startAbs < a.endAbs;
}

function minutesToHHMM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function formatDateLabel(dateYYYYMMDD: string, short = false) {
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  return date.toLocaleDateString("es-ES", {
    weekday: short ? "short" : "long",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatWeekRange(from: string, to: string) {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
    });
  };
  return `${fmt(from)} – ${fmt(to)}`;
}

export default function AdminPlannedShiftsPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [planned, setPlanned] = useState<PlannedShiftRow[]>([]);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [weekStart, setWeekStart] = useState(getWeekKey(todayYYYYMMDD()));
  const [mobileDay, setMobileDay] = useState(todayYYYYMMDD());

  const weekEnd = useMemo(() => addDaysYYYYMMDD(weekStart, 6), [weekStart]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysYYYYMMDD(weekStart, i));
  }, [weekStart]);

  const [duplicateFromDate, setDuplicateFromDate] = useState(todayYYYYMMDD());
  const [duplicateToDate, setDuplicateToDate] = useState(addDaysYYYYMMDD(todayYYYYMMDD(), 7));

  const [createOpen, setCreateOpen] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newDate, setNewDate] = useState(todayYYYYMMDD());
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [newNotes, setNewNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingRow | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);
  const [duplicatePanelOpen, setDuplicatePanelOpen] = useState(false);

  const nameByUser = useMemo(() => {
    const map: Record<string, string> = {};
    for (const w of workers) {
      map[w.user_id] = w.full_name?.trim() || w.user_id.slice(0, 8);
    }
    return map;
  }, [workers]);

  const visiblePlanned = useMemo(() => {
    if (!selectedUserId) return planned;
    return planned.filter((p) => p.user_id === selectedUserId);
  }, [planned, selectedUserId]);

  const totalWeekMinutes = useMemo(() => {
    return visiblePlanned.reduce((acc, p) => acc + minutesBetween(p.start_time, p.end_time), 0);
  }, [visiblePlanned]);

  const plannedByDay = useMemo(() => {
    const map: Record<string, PlannedShiftRow[]> = {};
    for (const day of weekDays) map[day] = [];

    for (const p of visiblePlanned) {
      if (!map[p.planned_date]) map[p.planned_date] = [];
      map[p.planned_date].push(p);
    }

    return map;
  }, [visiblePlanned, weekDays]);

  const summaryByWorker = useMemo(() => {
    const map: Record<
      string,
      {
        user_id: string;
        name: string;
        shifts: number;
        totalMinutes: number;
      }
    > = {};

    for (const p of planned) {
      const mins = minutesBetween(p.start_time, p.end_time);

      if (!map[p.user_id]) {
        map[p.user_id] = {
          user_id: p.user_id,
          name: nameByUser[p.user_id] || p.user_id.slice(0, 8),
          shifts: 0,
          totalMinutes: 0,
        };
      }

      map[p.user_id].shifts += 1;
      map[p.user_id].totalMinutes += mins;
    }

    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [planned, nameByUser]);

  const load = async (opts?: { from?: string; to?: string }) => {
    setLoading(true);
    setErrorMsg(null);

    const qFrom = opts?.from ?? weekStart;
    const qTo = opts?.to ?? weekEnd;

    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);

      const session = sess.session;
      if (!session) {
        router.push("/login?next=/admin/planned-shifts");
        return;
      }

      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("role, is_owner, company_id")
        .eq("user_id", session.user.id)
        .maybeSingle<{ role: string | null; is_owner: boolean | null; company_id: string | null }>();

      if (meErr) throw new Error(meErr.message);

      const isAdmin = me?.is_owner === true || (me?.role || "").toLowerCase() === "admin";
      if (!isAdmin) throw new Error("No tienes permisos de admin para ver esta página.");
      if (!me?.company_id) throw new Error("Tu usuario no está asociado a una empresa.");

      setCompanyId(me.company_id);

      const { data: company, error: compErr } = await supabase
        .from("companies")
        .select("enable_shift_planning")
        .eq("id", me.company_id)
        .maybeSingle<{ enable_shift_planning: boolean | null }>();

      if (compErr) throw new Error(compErr.message);

      const moduleEnabled = company?.enable_shift_planning === true;
      setEnabled(moduleEnabled);

      if (!moduleEnabled) {
        setWorkers([]);
        setPlanned([]);
        return;
      }

      const { data: workerRows, error: wErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, dni")
        .eq("company_id", me.company_id)
        .eq("active", true)
        .order("full_name", { ascending: true });

      if (wErr) throw new Error(wErr.message);

      const workerList = (workerRows ?? []) as WorkerRow[];
      setWorkers(workerList);

      if (!newUserId && workerList.length > 0) {
        setNewUserId(workerList[0].user_id);
      }

      const { data: plannedRows, error: pErr } = await supabase
        .from("planned_shifts")
        .select(
          "id, company_id, user_id, planned_date, start_time, end_time, break_minutes, notes, created_by, created_at, updated_at"
        )
        .eq("company_id", me.company_id)
        .gte("planned_date", qFrom)
        .lte("planned_date", qTo)
        .order("planned_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (pErr) throw new Error(pErr.message);

      setPlanned((plannedRows ?? []) as PlannedShiftRow[]);
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
  }, [weekStart]);

  useEffect(() => {
    if (!weekDays.includes(mobileDay)) {
      setMobileDay(weekStart);
    }
  }, [weekDays, weekStart, mobileDay]);

  const hasOverlap = (params: {
    user_id: string;
    planned_date: string;
    start_time: string;
    end_time: string;
    ignoreId?: string;
  }) => {
    const target = intervalForShift(params.planned_date, params.start_time, params.end_time);

    return planned.some((p) => {
      if (params.ignoreId && p.id === params.ignoreId) return false;
      if (p.user_id !== params.user_id) return false;
      if (p.planned_date !== params.planned_date) return false;

      const existing = intervalForShift(p.planned_date, p.start_time, p.end_time);
      return shiftsOverlap(target, existing);
    });
  };

  const openCreate = (presetDate?: string) => {
    setFormError(null);
    setNewDate(presetDate || mobileDay || todayYYYYMMDD());
    setNewStart("09:00");
    setNewEnd("17:00");
    setNewNotes("");
    if (!newUserId && workers.length > 0) setNewUserId(workers[0].user_id);
    setCreateOpen(true);
  };

  const createPlannedShift = async () => {
    setFormError(null);

    if (!companyId) {
      setFormError("No se pudo determinar la empresa.");
      return;
    }

    if (!newUserId) {
      setFormError("Selecciona un trabajador.");
      return;
    }

    if (!newDate || !newStart || !newEnd) {
      setFormError("Completa fecha, hora de inicio y hora de fin.");
      return;
    }

    if (
      hasOverlap({
        user_id: newUserId,
        planned_date: newDate,
        start_time: newStart,
        end_time: newEnd,
      })
    ) {
      setFormError("Este trabajador ya tiene un turno que se solapa en esa fecha.");
      return;
    }

    setSaving(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const createdBy = sess.session?.user.id ?? null;

      const { error } = await supabase.from("planned_shifts").insert({
        company_id: companyId,
        user_id: newUserId,
        planned_date: newDate,
        start_time: newStart,
        end_time: newEnd,
        break_minutes: 0,
        notes: newNotes.trim() || null,
        created_by: createdBy,
      });

      if (error) throw new Error(error.message);

      setNewNotes("");
      setCreateOpen(false);
      success("Turno planificado creado");
      await load();
    } catch (e: unknown) {
      const msg = userFacingError(e);
      setFormError(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  };

  const runDuplicateWeek = async () => {
    if (!companyId) {
      toastError("No se pudo determinar la empresa.");
      setDuplicateConfirmOpen(false);
      return;
    }

    const fromMonday = getWeekKey(duplicateFromDate);
    const toMonday = getWeekKey(duplicateToDate);

    if (fromMonday === toMonday) {
      toastError("La semana origen y destino no pueden ser la misma.");
      setDuplicateConfirmOpen(false);
      return;
    }

    setDuplicating(true);

    try {
      const { error } = await supabase.rpc("duplicate_planned_week", {
        p_company_id: companyId,
        p_from_monday: fromMonday,
        p_to_monday: toMonday,
      });

      if (error) throw new Error(error.message);

      setWeekStart(toMonday);
      setDuplicateConfirmOpen(false);
      setDuplicatePanelOpen(false);
      success("Semana duplicada correctamente");
    } catch (e: unknown) {
      toastError(userFacingError(e));
    } finally {
      setDuplicating(false);
    }
  };

  const startEdit = (p: PlannedShiftRow) => {
    setEditError(null);
    setEditingId(p.id);
    setEditing({
      user_id: p.user_id,
      planned_date: p.planned_date,
      start_time: p.start_time.slice(0, 5),
      end_time: p.end_time.slice(0, 5),
      notes: p.notes || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditing(null);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editing || !editingId) return;
    setEditError(null);

    if (!editing.user_id) {
      setEditError("Selecciona un trabajador.");
      return;
    }

    if (!editing.planned_date || !editing.start_time || !editing.end_time) {
      setEditError("Completa fecha, inicio y fin.");
      return;
    }

    if (
      hasOverlap({
        user_id: editing.user_id,
        planned_date: editing.planned_date,
        start_time: editing.start_time,
        end_time: editing.end_time,
        ignoreId: editingId,
      })
    ) {
      setEditError("Este trabajador ya tiene otro turno que se solapa en esa fecha.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("planned_shifts")
        .update({
          user_id: editing.user_id,
          planned_date: editing.planned_date,
          start_time: editing.start_time,
          end_time: editing.end_time,
          break_minutes: 0,
          notes: editing.notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingId)
        .eq("company_id", companyId);

      if (error) throw new Error(error.message);

      cancelEdit();
      success("Turno actualizado");
      await load();
    } catch (e: unknown) {
      const msg = userFacingError(e);
      setEditError(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    if (!companyId) {
      toastError("No se pudo determinar la empresa.");
      setDeleteId(null);
      return;
    }

    setDeleting(true);

    try {
      const { error } = await supabase
        .from("planned_shifts")
        .delete()
        .eq("id", deleteId)
        .eq("company_id", companyId);

      if (error) throw new Error(error.message);

      setDeleteId(null);
      cancelEdit();
      success("Turno eliminado");
      await load();
    } catch (e: unknown) {
      toastError(userFacingError(e));
    } finally {
      setDeleting(false);
    }
  };

  const goPrevWeek = () => setWeekStart((prev) => addDaysYYYYMMDD(prev, -7));
  const goCurrentWeek = () => setWeekStart(getWeekKey(todayYYYYMMDD()));
  const goNextWeek = () => setWeekStart((prev) => addDaysYYYYMMDD(prev, 7));

  const renderShiftCard = (p: PlannedShiftRow) => {
    const crossesMidnight = p.end_time.slice(0, 5) <= p.start_time.slice(0, 5);

    return (
      <div
        key={p.id}
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[var(--text)]">
              {nameByUser[p.user_id] || p.user_id.slice(0, 8)}
            </div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">
              {p.start_time.slice(0, 5)} – {p.end_time.slice(0, 5)}
              {crossesMidnight ? " (+1 día)" : ""}
            </div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              {minutesToHHMM(minutesBetween(p.start_time, p.end_time))}
            </div>
            {p.notes ? (
              <div className="mt-2 text-xs text-[var(--text-muted)] line-clamp-2">
                {p.notes}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Editar turno"
              onClick={() => startEdit(p)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Eliminar turno"
              onClick={() => setDeleteId(p.id)}
            >
              <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (loading && !companyId && !errorMsg) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Planificación"
        description="Cuadrante semanal de turnos planificados"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Recargar
            </Button>
            {enabled ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => setDuplicatePanelOpen(true)}>
                  <Copy className="h-4 w-4" />
                  Duplicar
                </Button>
                <Button variant="primary" size="sm" onClick={() => openCreate()}>
                  <Plus className="h-4 w-4" />
                  Nuevo turno
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {errorMsg ? <ErrorState message={errorMsg} onRetry={() => load()} /> : null}

      {!enabled && !loading ? (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" />}
          title="Planificación no activada"
          description="La planificación de turnos no está activada para esta empresa. Contacta con el propietario de la plataforma."
        />
      ) : (
        <>
          <Card>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={goPrevWeek} aria-label="Semana anterior">
                  <ChevronLeft className="h-4 w-4" />
                  Semana
                </Button>
                <div className="min-w-[11rem] text-center text-sm font-medium text-[var(--text)]">
                  {formatWeekRange(weekStart, weekEnd)}
                </div>
                <Button variant="secondary" size="sm" onClick={goNextWeek} aria-label="Semana siguiente">
                  Semana
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={goCurrentWeek}>
                  Esta semana
                </Button>
              </div>

              <FormField label="Filtrar trabajador" htmlFor="filter-worker">
                <Select
                  id="filter-worker"
                  className="min-w-[220px]"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">Todos</option>
                  {workers.map((w) => (
                    <option key={w.user_id} value={w.user_id}>
                      {w.full_name?.trim() || w.user_id.slice(0, 8)}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Turnos esta semana" value={String(visiblePlanned.length)} />
            <StatCard title="Horas planificadas" value={minutesToHHMM(totalWeekMinutes)} />
            <StatCard title="Trabajadores" value={String(summaryByWorker.length)} />
          </div>

          {summaryByWorker.length > 0 ? (
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-[var(--text)]">
                Resumen por trabajador
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {summaryByWorker.map((s) => (
                  <div
                    key={s.user_id}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-4"
                  >
                    <div className="font-medium text-[var(--text)]">{s.name}</div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">
                      {s.shifts} turno{s.shifts === 1 ? "" : "s"} ·{" "}
                      {minutesToHHMM(s.totalMinutes)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {/* Desktop weekly grid */}
          <Card className="hidden md:block" padding={false}>
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-sm font-semibold text-[var(--text)]">Cuadrante semanal</h2>
            </div>
            {loading ? (
              <div className="p-6 text-sm text-[var(--text-secondary)]">Cargando…</div>
            ) : (
              <div className="grid grid-cols-7 gap-px bg-[var(--border)]">
                {weekDays.map((day) => {
                  const dayShifts = plannedByDay[day] || [];
                  const dayMinutes = dayShifts.reduce(
                    (acc, p) => acc + minutesBetween(p.start_time, p.end_time),
                    0
                  );

                  return (
                    <div key={day} className="min-h-[260px] bg-[var(--surface)] p-3">
                      <div className="mb-2 flex items-start justify-between gap-1">
                        <div>
                          <div className="text-xs font-semibold capitalize text-[var(--text)]">
                            {formatDateLabel(day, true)}
                          </div>
                          <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                            {dayShifts.length} · {minutesToHHMM(dayMinutes)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="!px-1.5 !py-1"
                          aria-label={`Añadir turno el ${day}`}
                          onClick={() => openCreate(day)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {dayShifts.length === 0 ? (
                          <p className="text-[11px] text-[var(--text-muted)]">Sin turnos</p>
                        ) : (
                          dayShifts.map(renderShiftCard)
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Mobile: day selector + list */}
          <div className="space-y-4 md:hidden">
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Día</h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {weekDays.map((day) => {
                  const count = (plannedByDay[day] || []).length;
                  const active = mobileDay === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setMobileDay(day)}
                      className={`shrink-0 rounded-[var(--radius-md)] border px-3 py-2 text-left transition ${
                        active
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] bg-[var(--surface-muted)]"
                      }`}
                    >
                      <div className="text-xs font-medium capitalize text-[var(--text)]">
                        {formatDateLabel(day, true)}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                        {count} turno{count === 1 ? "" : "s"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold capitalize text-[var(--text)]">
                    {formatDateLabel(mobileDay)}
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {(plannedByDay[mobileDay] || []).length} turno(s)
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={() => openCreate(mobileDay)}>
                  <Plus className="h-4 w-4" />
                  Añadir
                </Button>
              </div>

              {loading ? (
                <p className="text-sm text-[var(--text-secondary)]">Cargando…</p>
              ) : (plannedByDay[mobileDay] || []).length === 0 ? (
                <EmptyState
                  title="Sin turnos este día"
                  description="Añade un turno planificado para este día."
                  actionLabel="Nuevo turno"
                  onAction={() => openCreate(mobileDay)}
                />
              ) : (
                <div className="space-y-2">
                  {(plannedByDay[mobileDay] || []).map(renderShiftCard)}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {/* Create modal */}
      <Modal open={createOpen} title="Nuevo turno planificado" onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <FormField label="Trabajador" htmlFor="new-user" error={formError && !newUserId ? formError : null}>
            <Select
              id="new-user"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
            >
              <option value="">Selecciona trabajador</option>
              {workers.map((w) => (
                <option key={w.user_id} value={w.user_id}>
                  {w.full_name?.trim() || w.user_id.slice(0, 8)}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Fecha" htmlFor="new-date">
            <Input
              id="new-date"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Inicio" htmlFor="new-start">
              <Input
                id="new-start"
                type="time"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
              />
            </FormField>
            <FormField label="Fin" htmlFor="new-end">
              <Input
                id="new-end"
                type="time"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
              />
            </FormField>
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            Si la hora de fin es anterior a la de inicio, el turno termina al día siguiente.
          </p>

          <FormField label="Notas" htmlFor="new-notes" hint="Opcional">
            <Input
              id="new-notes"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Opcional"
            />
          </FormField>

          {formError ? <p className="text-sm text-[var(--danger)]">{formError}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={createPlannedShift} loading={saving}>
              Crear turno
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editingId && !!editing}
        title="Editar turno"
        onClose={cancelEdit}
      >
        {editing ? (
          <div className="space-y-4">
            <FormField label="Trabajador" htmlFor="edit-user">
              <Select
                id="edit-user"
                value={editing.user_id}
                onChange={(e) => setEditing({ ...editing, user_id: e.target.value })}
              >
                {workers.map((w) => (
                  <option key={w.user_id} value={w.user_id}>
                    {w.full_name?.trim() || w.user_id.slice(0, 8)}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Fecha" htmlFor="edit-date">
              <Input
                id="edit-date"
                type="date"
                value={editing.planned_date}
                onChange={(e) => setEditing({ ...editing, planned_date: e.target.value })}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Inicio" htmlFor="edit-start">
                <Input
                  id="edit-start"
                  type="time"
                  value={editing.start_time}
                  onChange={(e) => setEditing({ ...editing, start_time: e.target.value })}
                />
              </FormField>
              <FormField label="Fin" htmlFor="edit-end">
                <Input
                  id="edit-end"
                  type="time"
                  value={editing.end_time}
                  onChange={(e) => setEditing({ ...editing, end_time: e.target.value })}
                />
              </FormField>
            </div>

            <FormField label="Notas" htmlFor="edit-notes">
              <Input
                id="edit-notes"
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                placeholder="Opcional"
              />
            </FormField>

            {editError ? <p className="text-sm text-[var(--danger)]">{editError}</p> : null}

            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button
                variant="danger"
                onClick={() => {
                  if (editingId) setDeleteId(editingId);
                }}
                disabled={saving}
              >
                Eliminar
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                  Cancelar
                </Button>
                <Button variant="primary" onClick={saveEdit} loading={saving}>
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Duplicate panel modal */}
      <Modal
        open={duplicatePanelOpen}
        title="Duplicar semana"
        onClose={() => setDuplicatePanelOpen(false)}
      >
        <div className="space-y-4">
          <FormField
            label="Semana origen"
            htmlFor="dup-from"
            hint={`Lunes ${getWeekKey(duplicateFromDate)}`}
          >
            <Input
              id="dup-from"
              type="date"
              value={duplicateFromDate}
              onChange={(e) => setDuplicateFromDate(e.target.value)}
            />
          </FormField>
          <FormField
            label="Semana destino"
            htmlFor="dup-to"
            hint={`Lunes ${getWeekKey(duplicateToDate)}`}
          >
            <Input
              id="dup-to"
              type="date"
              value={duplicateToDate}
              onChange={(e) => setDuplicateToDate(e.target.value)}
            />
          </FormField>
          <p className="text-xs text-[var(--text-muted)]">
            Se copiarán todos los turnos planificados de la semana origen a la destino.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDuplicatePanelOpen(false)}>
              Cancelar
            </Button>
            <Button variant="accent" onClick={() => setDuplicateConfirmOpen(true)}>
              Continuar
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={duplicateConfirmOpen}
        title="¿Duplicar semana?"
        description={`Se copiarán los turnos del lunes ${getWeekKey(duplicateFromDate)} al lunes ${getWeekKey(duplicateToDate)}.`}
        confirmLabel="Duplicar"
        loading={duplicating}
        onConfirm={runDuplicateWeek}
        onCancel={() => setDuplicateConfirmOpen(false)}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="¿Eliminar turno?"
        description="Esta acción no se puede deshacer. El turno planificado se eliminará."
        confirmLabel="Eliminar"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
