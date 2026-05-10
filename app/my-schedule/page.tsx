"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

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
    <main className="min-h-screen bg-[#111827] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
            <div>
              <div className="text-white/60 text-xs">Fichagest · by Iberogest</div>
              <h1 className="text-3xl font-bold text-white mt-1">Mis turnos</h1>
              <p className="text-white/60 mt-1">
                Semana del <b className="text-white">{weekStart}</b> al{" "}
                <b className="text-white">{weekEnd}</b>
              </p>
            </div>

            <div className="flex gap-3 flex-wrap justify-end">
              <button
                onClick={load}
                disabled={loading}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
              >
                {loading ? "Cargando..." : "Recargar"}
              </button>

              <a
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
                href="/clock"
              >
                Fichar
              </a>

              <a
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
                href="/app"
              >
                Panel
              </a>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-100">
              {errorMsg}
            </div>
          )}

          {!enabled && !loading ? (
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-yellow-100">
              La planificación de turnos no está activada para tu empresa.
            </div>
          ) : (
            <>
              <div className="border border-white/10 rounded-2xl p-5 mb-6 bg-black/20">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-bold text-white">Vista semanal</div>
                    <div className="text-sm text-white/60 mt-1">
                      Turnos: <b className="text-white">{planned.length}</b> · Horas previstas:{" "}
                      <b className="text-white">{minutesToHHMM(totalMinutes)}</b>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={goPrevWeek}
                      className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white hover:bg-white/[0.10] transition"
                    >
                      ← Semana anterior
                    </button>

                    <button
                      onClick={goCurrentWeek}
                      className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white hover:bg-white/[0.10] transition"
                    >
                      Semana actual
                    </button>

                    <button
                      onClick={goNextWeek}
                      className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white hover:bg-white/[0.10] transition"
                    >
                      Semana siguiente →
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                {weekDays.map((day) => {
                  const dayShifts = plannedByDay[day] || [];
                  const dayMinutes = dayShifts.reduce(
                    (acc, p) => acc + minutesBetween(p.start_time, p.end_time),
                    0
                  );

                  return (
                    <div
                      key={day}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4 min-h-[170px]"
                    >
                      <div className="text-white font-semibold capitalize text-sm">
                        {formatDateLabel(day)}
                      </div>

                      <div className="text-white/45 text-xs mt-1">
                        {dayShifts.length} turno(s) · {minutesToHHMM(dayMinutes)}
                      </div>

                      <div className="mt-4 space-y-2">
                        {dayShifts.length === 0 ? (
                          <div className="text-white/35 text-xs">Sin turno</div>
                        ) : (
                          dayShifts.map((p) => {
                            const crossesMidnight =
                              p.end_time.slice(0, 5) <= p.start_time.slice(0, 5);

                            return (
                              <div
                                key={p.id}
                                className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                              >
                                <div className="text-white text-sm font-medium">
                                  {p.start_time.slice(0, 5)} - {p.end_time.slice(0, 5)}
                                  {crossesMidnight ? " (+1 día)" : ""}
                                </div>

                                <div className="text-white/55 text-xs mt-1">
                                  {minutesToHHMM(minutesBetween(p.start_time, p.end_time))}
                                </div>

                                {p.notes && (
                                  <div className="text-white/45 text-xs mt-2">Nota: {p.notes}</div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border border-white/10 rounded-2xl p-5 bg-black/20 mt-6">
                <div className="font-bold mb-4 text-white">Listado de la semana</div>

                {loading ? (
                  <p className="text-white/70">Cargando...</p>
                ) : planned.length === 0 ? (
                  <p className="text-white/50">No tienes turnos planificados esta semana.</p>
                ) : (
                  <div className="space-y-3">
                    {planned.map((p) => {
                      const crossesMidnight =
                        p.end_time.slice(0, 5) <= p.start_time.slice(0, 5);

                      return (
                        <div
                          key={p.id}
                          className="border border-white/10 rounded-xl p-4 bg-white/[0.03]"
                        >
                          <div className="flex justify-between gap-4 flex-wrap">
                            <div>
                              <div className="font-bold text-white capitalize">
                                {formatDateLabel(p.planned_date)}
                              </div>

                              <div className="text-sm text-white/70 mt-1">
                                {p.start_time.slice(0, 5)} - {p.end_time.slice(0, 5)}
                                {crossesMidnight ? " (+1 día)" : ""} ·{" "}
                                {minutesToHHMM(minutesBetween(p.start_time, p.end_time))}
                              </div>

                              {p.notes && (
                                <div className="text-sm text-white/50 mt-1">Nota: {p.notes}</div>
                              )}
                            </div>

                            <div className="text-xs text-white/40">Turno planificado</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}