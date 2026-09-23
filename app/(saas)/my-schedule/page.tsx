"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

type PlannedShiftRow = {
  id: string;
  company_id: string;
  user_id: string;
  planned_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
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

function startOfWeekYYYYMMDD(dateYYYYMMDD: string) {
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  let weekDay = date.getDay();
  if (weekDay === 0) weekDay = 7;

  date.setDate(date.getDate() - (weekDay - 1));

  return dateToYYYYMMDD(date);
}

function addDaysYYYYMMDD(dateYYYYMMDD: string, days: number) {
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return dateToYYYYMMDD(date);
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

function minutesToHHMM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function formatDateLabel(dateYYYYMMDD: string) {
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  return date.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatWeekRange(start: string, end: string) {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const startDate = new Date(ys, ms - 1, ds);
  const endDate = new Date(ye, me - 1, de);

  const startLabel = startDate.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });
  const endLabel = endDate.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `${startLabel} – ${endLabel}`;
}

export default function MySchedulePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [weekStart, setWeekStart] = useState(startOfWeekYYYYMMDD(todayYYYYMMDD()));
  const [planned, setPlanned] = useState<PlannedShiftRow[]>([]);

  const weekEnd = useMemo(() => addDaysYYYYMMDD(weekStart, 6), [weekStart]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysYYYYMMDD(weekStart, i));
  }, [weekStart]);

  const totalMinutes = useMemo(() => {
    return planned.reduce((acc, p) => acc + minutesBetween(p.start_time, p.end_time), 0);
  }, [planned]);

  const plannedByDay = useMemo(() => {
    const map: Record<string, PlannedShiftRow[]> = {};
    for (const day of weekDays) map[day] = [];

    for (const p of planned) {
      if (!map[p.planned_date]) map[p.planned_date] = [];
      map[p.planned_date].push(p);
    }

    return map;
  }, [planned, weekDays]);

  const todayKey = todayYYYYMMDD();

  const goPrevWeek = () => {
    setWeekStart((prev) => addDaysYYYYMMDD(prev, -7));
  };

  const goCurrentWeek = () => {
    setWeekStart(startOfWeekYYYYMMDD(todayYYYYMMDD()));
  };

  const goNextWeek = () => {
    setWeekStart((prev) => addDaysYYYYMMDD(prev, 7));
  };

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);

      const session = sess.session;
      if (!session) {
        router.push("/login?next=/my-schedule");
        return;
      }

      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", session.user.id)
        .maybeSingle<{ company_id: string | null }>();

      if (meErr) throw new Error(meErr.message);
      if (!me?.company_id) throw new Error("Tu usuario no está asociado a una empresa.");

      const { data: company, error: compErr } = await supabase
        .from("companies")
        .select("enable_shift_planning")
        .eq("id", me.company_id)
        .maybeSingle<{ enable_shift_planning: boolean | null }>();

      if (compErr) throw new Error(compErr.message);

      const moduleEnabled = company?.enable_shift_planning === true;
      setEnabled(moduleEnabled);

      if (!moduleEnabled) {
        setPlanned([]);
        return;
      }

      const { data, error } = await supabase
        .from("planned_shifts")
        .select("id, company_id, user_id, planned_date, start_time, end_time, notes")
        .eq("company_id", me.company_id)
        .eq("user_id", session.user.id)
        .gte("planned_date", weekStart)
        .lte("planned_date", weekEnd)
        .order("planned_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) throw new Error(error.message);

      setPlanned((data ?? []) as PlannedShiftRow[]);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Mi horario"
        description={`Semana del ${formatWeekRange(weekStart, weekEnd)}`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            <Link href="/clock">
              <Button variant="primary" size="sm">
                <Clock3 className="h-4 w-4" />
                Fichar
              </Button>
            </Link>
          </>
        }
      />

      {errorMsg ? <ErrorState message={errorMsg} onRetry={load} /> : null}

      {!enabled && !loading ? (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" />}
          title="Planificación no disponible"
          description="La planificación de turnos no está activada para tu empresa."
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <StatCard title="Turnos" value={String(planned.length)} sub="En esta semana" />
              <StatCard
                title="Horas previstas"
                value={minutesToHHMM(totalMinutes)}
                sub="Duración planificada"
                tone="info"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={goPrevWeek} aria-label="Semana anterior">
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button variant="secondary" size="sm" onClick={goCurrentWeek}>
                Hoy
              </Button>
              <Button variant="secondary" size="sm" onClick={goNextWeek} aria-label="Semana siguiente">
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {loading ? (
            <LoadingState label="Cargando horario…" />
          ) : (
            <>
              {/* Desktop week grid */}
              <div className="hidden gap-3 md:grid md:grid-cols-7">
                {weekDays.map((day) => {
                  const dayShifts = plannedByDay[day] || [];
                  const dayMinutes = dayShifts.reduce(
                    (acc, p) => acc + minutesBetween(p.start_time, p.end_time),
                    0
                  );
                  const isToday = day === todayKey;

                  return (
                    <Card
                      key={day}
                      className={`min-h-[180px] !p-4 ${
                        isToday
                          ? "border-[var(--accent)]/40 ring-1 ring-[var(--accent)]/30"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold capitalize text-[var(--text)]">
                          {formatDateLabel(day)}
                        </div>
                        {isToday ? <Badge tone="accent">Hoy</Badge> : null}
                      </div>

                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        {dayShifts.length === 0
                          ? "Libre"
                          : `${dayShifts.length} turno(s) · ${minutesToHHMM(dayMinutes)}`}
                      </div>

                      <div className="mt-4 space-y-2">
                        {dayShifts.length === 0 ? (
                          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-3 py-4 text-center text-xs text-[var(--text-muted)]">
                            Libre
                          </div>
                        ) : (
                          dayShifts.map((p) => {
                            const crossesMidnight =
                              p.end_time.slice(0, 5) <= p.start_time.slice(0, 5);

                            return (
                              <div
                                key={p.id}
                                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3"
                              >
                                <div className="text-sm font-medium text-[var(--text)]">
                                  {p.start_time.slice(0, 5)} – {p.end_time.slice(0, 5)}
                                  {crossesMidnight ? " (+1 día)" : ""}
                                </div>
                                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                                  {minutesToHHMM(minutesBetween(p.start_time, p.end_time))}
                                </div>
                                {p.notes ? (
                                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                                    {p.notes}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Mobile day cards */}
              <div className="space-y-3 md:hidden">
                {weekDays.map((day) => {
                  const dayShifts = plannedByDay[day] || [];
                  const dayMinutes = dayShifts.reduce(
                    (acc, p) => acc + minutesBetween(p.start_time, p.end_time),
                    0
                  );
                  const isToday = day === todayKey;

                  return (
                    <Card
                      key={day}
                      className={
                        isToday
                          ? "border-[var(--accent)]/40 ring-1 ring-[var(--accent)]/30"
                          : ""
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold capitalize text-[var(--text)]">
                            {formatDateLabel(day)}
                          </div>
                          <div className="mt-1 text-xs text-[var(--text-muted)]">
                            {dayShifts.length === 0
                              ? "Libre"
                              : `${dayShifts.length} turno(s) · ${minutesToHHMM(dayMinutes)}`}
                          </div>
                        </div>
                        {isToday ? <Badge tone="accent">Hoy</Badge> : null}
                      </div>

                      <div className="mt-4 space-y-2">
                        {dayShifts.length === 0 ? (
                          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-3 py-4 text-center text-sm text-[var(--text-muted)]">
                            Libre
                          </div>
                        ) : (
                          dayShifts.map((p) => {
                            const crossesMidnight =
                              p.end_time.slice(0, 5) <= p.start_time.slice(0, 5);

                            return (
                              <div
                                key={p.id}
                                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3"
                              >
                                <div className="text-sm font-medium text-[var(--text)]">
                                  {p.start_time.slice(0, 5)} – {p.end_time.slice(0, 5)}
                                  {crossesMidnight ? " (+1 día)" : ""}
                                </div>
                                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                                  {minutesToHHMM(minutesBetween(p.start_time, p.end_time))}
                                </div>
                                {p.notes ? (
                                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                                    {p.notes}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>

              {planned.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays className="h-8 w-8" />}
                  title="Sin turnos esta semana"
                  description="No tienes turnos planificados en el periodo seleccionado."
                />
              ) : (
                <Card>
                  <div className="mb-4 text-sm font-semibold text-[var(--text)]">
                    Listado de la semana
                  </div>
                  <ul className="divide-y divide-[var(--border)]">
                    {planned.map((p) => {
                      const crossesMidnight =
                        p.end_time.slice(0, 5) <= p.start_time.slice(0, 5);

                      return (
                        <li
                          key={p.id}
                          className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <div className="text-sm font-medium capitalize text-[var(--text)]">
                              {formatDateLabel(p.planned_date)}
                            </div>
                            <div className="mt-1 text-sm text-[var(--text-secondary)]">
                              {p.start_time.slice(0, 5)} – {p.end_time.slice(0, 5)}
                              {crossesMidnight ? " (+1 día)" : ""} ·{" "}
                              {minutesToHHMM(minutesBetween(p.start_time, p.end_time))}
                            </div>
                            {p.notes ? (
                              <div className="mt-1 text-xs text-[var(--text-muted)]">
                                {p.notes}
                              </div>
                            ) : null}
                          </div>
                          <Badge tone="neutral">Planificado</Badge>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
