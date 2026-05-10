"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

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

function shiftsOverlap(a: { startAbs: number; endAbs: number }, b: { startAbs: number; endAbs: number }) {
  return a.startAbs < b.endAbs && b.startAbs < a.endAbs;
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

export default function AdminPlannedShiftsPage() {
  const router = useRouter();

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

  const weekEnd = useMemo(() => addDaysYYYYMMDD(weekStart, 6), [weekStart]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysYYYYMMDD(weekStart, i));
  }, [weekStart]);

  const [duplicateFromDate, setDuplicateFromDate] = useState(todayYYYYMMDD());
  const [duplicateToDate, setDuplicateToDate] = useState(addDaysYYYYMMDD(todayYYYYMMDD(), 7));

  const [newUserId, setNewUserId] = useState("");
  const [newDate, setNewDate] = useState(todayYYYYMMDD());
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [newNotes, setNewNotes] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingRow | null>(null);

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

  const createPlannedShift = async () => {
    if (!companyId) {
      alert("No se pudo determinar la empresa.");
      return;
    }

    if (!newUserId) {
      alert("Selecciona un trabajador.");
      return;
    }

    if (!newDate || !newStart || !newEnd) {
      alert("Completa fecha, hora inicio y hora fin.");
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
      alert("Este trabajador ya tiene un turno que se solapa en esa fecha.");
      return;
    }

    setSaving(true);

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

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    setNewNotes("");
    await load();
  };

  const duplicateWeek = async () => {
    if (!companyId) {
      alert("No se pudo determinar la empresa.");
      return;
    }

    const fromMonday = getWeekKey(duplicateFromDate);
    const toMonday = getWeekKey(duplicateToDate);

    if (fromMonday === toMonday) {
      alert("La semana origen y destino no pueden ser la misma.");
      return;
    }

    const ok = confirm(
      `¿Duplicar la semana ${fromMonday} en la semana ${toMonday}?\n\nSe copiarán todos los turnos planificados de esa semana.`
    );

    if (!ok) return;

    setDuplicating(true);

    const { error } = await supabase.rpc("duplicate_planned_week", {
      p_company_id: companyId,
      p_from_monday: fromMonday,
      p_to_monday: toMonday,
    });

    setDuplicating(false);

    if (error) {
      alert(error.message);
      return;
    }

    setWeekStart(toMonday);
    alert("Semana duplicada correctamente ✅");
  };

  const startEdit = (p: PlannedShiftRow) => {
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
  };

  const saveEdit = async (id: string) => {
    if (!editing) return;

    if (!editing.user_id) {
      alert("Selecciona un trabajador.");
      return;
    }

    if (!editing.planned_date || !editing.start_time || !editing.end_time) {
      alert("Completa fecha, inicio y fin.");
      return;
    }

    if (
      hasOverlap({
        user_id: editing.user_id,
        planned_date: editing.planned_date,
        start_time: editing.start_time,
        end_time: editing.end_time,
        ignoreId: id,
      })
    ) {
      alert("Este trabajador ya tiene otro turno que se solapa en esa fecha.");
      return;
    }

    setSaving(true);

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
      .eq("id", id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    cancelEdit();
    await load();
  };

  const deletePlannedShift = async (id: string) => {
    const ok = confirm("¿Eliminar este turno planificado?");
    if (!ok) return;

    const { error } = await supabase.from("planned_shifts").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    cancelEdit();
    await load();
  };

  const goPrevWeek = () => setWeekStart((prev) => addDaysYYYYMMDD(prev, -7));
  const goCurrentWeek = () => setWeekStart(getWeekKey(todayYYYYMMDD()));
  const goNextWeek = () => setWeekStart((prev) => addDaysYYYYMMDD(prev, 7));

  return (
    <main className="min-h-screen bg-[#111827] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
            <div>
              <div className="text-white/60 text-xs">Fichagest · by Iberogest</div>
              <h1 className="text-3xl font-bold text-white mt-1">Planificación semanal</h1>
              <p className="text-white/60 mt-1">
                Semana del <b className="text-white">{weekStart}</b> al{" "}
                <b className="text-white">{weekEnd}</b>
              </p>
            </div>

            <div className="flex gap-3 flex-wrap justify-end">
              <button
                onClick={() => load()}
                disabled={loading}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
              >
                {loading ? "Cargando..." : "Recargar"}
              </button>

              <a className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition" href="/admin/users">
                Usuarios
              </a>

              <a className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition" href="/admin/shifts">
                Fichajes
              </a>

              <a className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition" href="/app">
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
              La planificación de turnos no está activada para esta empresa.
            </div>
          ) : (
            <>
              <div className="border border-white/10 rounded-2xl p-5 mb-6 bg-black/20">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-bold text-white">Cuadrante semanal</div>
                    <div className="text-sm text-white/60 mt-1">
                      Turnos: <b className="text-white">{visiblePlanned.length}</b> · Horas:{" "}
                      <b className="text-white">{minutesToHHMM(totalWeekMinutes)}</b>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button onClick={goPrevWeek} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white">
                      ← Semana anterior
                    </button>
                    <button onClick={goCurrentWeek} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white">
                      Semana actual
                    </button>
                    <button onClick={goNextWeek} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white">
                      Semana siguiente →
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-white/60 mb-1">Filtrar trabajador</div>
                  <select
                    className="border border-white/10 rounded-xl px-3 py-2 text-sm min-w-[260px] bg-white/[0.04] text-white"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {workers.map((w) => (
                      <option key={w.user_id} value={w.user_id}>
                        {w.full_name?.trim() || w.user_id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border border-white/10 rounded-2xl p-5 mb-6 bg-black/20">
                <div className="font-bold mb-4 text-white">Resumen semanal por trabajador</div>

                {summaryByWorker.length === 0 ? (
                  <p className="text-white/50">No hay datos para resumir.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {summaryByWorker.map((s) => (
                      <div key={s.user_id} className="border border-white/10 rounded-xl p-4 bg-white/[0.03]">
                        <div className="font-bold text-white">{s.name}</div>
                        <div className="text-sm text-white/70 mt-1">
                          Turnos: <b className="text-white">{s.shifts}</b> · Horas:{" "}
                          <b className="text-white">{minutesToHHMM(s.totalMinutes)}</b>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-white/10 rounded-2xl p-5 bg-black/20 mb-6">
                <div className="font-bold mb-4 text-white">Cuadrante</div>

                {loading ? (
                  <p className="text-white/70">Cargando...</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                    {weekDays.map((day) => {
                      const dayShifts = plannedByDay[day] || [];
                      const dayMinutes = dayShifts.reduce(
                        (acc, p) => acc + minutesBetween(p.start_time, p.end_time),
                        0
                      );

                      return (
                        <div key={day} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 min-h-[220px]">
                          <div className="text-white text-sm font-semibold capitalize">
                            {formatDateLabel(day)}
                          </div>
                          <div className="text-white/45 text-xs mt-1">
                            {dayShifts.length} turno(s) · {minutesToHHMM(dayMinutes)}
                          </div>

                          <div className="mt-4 space-y-2">
                            {dayShifts.length === 0 ? (
                              <div className="text-white/35 text-xs">Sin turnos</div>
                            ) : (
                              dayShifts.map((p) => {
                                const isEditing = editingId === p.id && editing;
                                const crossesMidnight = p.end_time.slice(0, 5) <= p.start_time.slice(0, 5);

                                return (
                                  <div
                                    key={p.id}
                                    onClick={() => {
                                      if (!isEditing) startEdit(p);
                                    }}
                                    className={[
                                      "rounded-xl border border-white/10 bg-black/25 p-3 transition",
                                      isEditing ? "" : "cursor-pointer hover:bg-white/[0.06]",
                                    ].join(" ")}
                                  >
                                    {isEditing ? (
                                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                        <select
                                          className="w-full border border-white/10 rounded-xl px-2 py-2 text-xs bg-white/[0.04] text-white"
                                          value={editing.user_id}
                                          onChange={(e) => setEditing({ ...editing, user_id: e.target.value })}
                                        >
                                          {workers.map((w) => (
                                            <option key={w.user_id} value={w.user_id}>
                                              {w.full_name?.trim() || w.user_id.slice(0, 8)}
                                            </option>
                                          ))}
                                        </select>

                                        <input
                                          type="date"
                                          className="w-full border border-white/10 rounded-xl px-2 py-2 text-xs bg-white/[0.04] text-white"
                                          value={editing.planned_date}
                                          onChange={(e) => setEditing({ ...editing, planned_date: e.target.value })}
                                        />

                                        <div className="grid grid-cols-2 gap-2">
                                          <input
                                            type="time"
                                            className="border border-white/10 rounded-xl px-2 py-2 text-xs bg-white/[0.04] text-white"
                                            value={editing.start_time}
                                            onChange={(e) => setEditing({ ...editing, start_time: e.target.value })}
                                          />

                                          <input
                                            type="time"
                                            className="border border-white/10 rounded-xl px-2 py-2 text-xs bg-white/[0.04] text-white"
                                            value={editing.end_time}
                                            onChange={(e) => setEditing({ ...editing, end_time: e.target.value })}
                                          />
                                        </div>

                                        <input
                                          className="w-full border border-white/10 rounded-xl px-2 py-2 text-xs bg-white/[0.04] text-white"
                                          placeholder="Notas"
                                          value={editing.notes}
                                          onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                                        />

                                        <div className="flex gap-2 flex-wrap">
                                          <button
                                            className="rounded-xl bg-white text-black px-3 py-2 text-xs font-medium"
                                            onClick={() => saveEdit(p.id)}
                                            disabled={saving}
                                          >
                                            Guardar
                                          </button>

                                          <button
                                            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white"
                                            onClick={cancelEdit}
                                            disabled={saving}
                                          >
                                            Cancelar
                                          </button>

                                          <button
                                            className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100"
                                            onClick={() => deletePlannedShift(p.id)}
                                            disabled={saving}
                                          >
                                            Eliminar
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="text-white text-xs font-semibold">
                                          {nameByUser[p.user_id] || p.user_id.slice(0, 8)}
                                        </div>
                                        <div className="text-white/70 text-xs mt-1">
                                          {p.start_time.slice(0, 5)} - {p.end_time.slice(0, 5)}
                                          {crossesMidnight ? " (+1 día)" : ""}
                                        </div>
                                        <div className="text-white/45 text-xs mt-1">
                                          {minutesToHHMM(minutesBetween(p.start_time, p.end_time))}
                                        </div>

                                        {p.notes && (
                                          <div className="text-white/45 text-xs mt-2">Nota: {p.notes}</div>
                                        )}

                                        <div className="text-[10px] text-white/35 mt-3">
                                          Clic para editar
                                        </div>
                                      </>
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
                )}
              </div>

              <div className="border border-white/10 rounded-2xl p-5 mb-6 bg-black/20">
                <div className="font-bold mb-4 text-white">Crear turno planificado</div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div className="md:col-span-2">
                    <div className="text-xs text-white/60 mb-1">Trabajador</div>
                    <select
                      className="w-full border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
                      value={newUserId}
                      onChange={(e) => setNewUserId(e.target.value)}
                    >
                      <option value="">Selecciona trabajador</option>
                      {workers.map((w) => (
                        <option key={w.user_id} value={w.user_id}>
                          {w.full_name?.trim() || w.user_id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-xs text-white/60 mb-1">Fecha</div>
                    <input
                      type="date"
                      className="w-full border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className="text-xs text-white/60 mb-1">Inicio</div>
                    <input
                      type="time"
                      className="w-full border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
                      value={newStart}
                      onChange={(e) => setNewStart(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className="text-xs text-white/60 mb-1">Fin</div>
                    <input
                      type="time"
                      className="w-full border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
                      value={newEnd}
                      onChange={(e) => setNewEnd(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-2 text-xs text-white/40">
                  Si la hora de fin es anterior a la de inicio, el turno termina al día siguiente.
                </div>

                <div className="mt-3">
                  <div className="text-xs text-white/60 mb-1">Notas</div>
                  <input
                    className="w-full border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
                    placeholder="Opcional"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                  />
                </div>

                <div className="mt-4">
                  <button
                    onClick={createPlannedShift}
                    disabled={saving || loading}
                    className="rounded-xl bg-white text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? "Guardando..." : "+ Crear turno"}
                  </button>
                </div>
              </div>

              <div className="border border-white/10 rounded-2xl p-5 mb-6 bg-black/20">
                <div className="font-bold mb-4 text-white">Duplicar semana</div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div>
                    <div className="text-xs text-white/60 mb-1">Semana origen</div>
                    <input
                      type="date"
                      className="w-full border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
                      value={duplicateFromDate}
                      onChange={(e) => setDuplicateFromDate(e.target.value)}
                    />
                    <div className="text-xs text-white/40 mt-1">
                      Desde lunes {getWeekKey(duplicateFromDate)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-white/60 mb-1">Semana destino</div>
                    <input
                      type="date"
                      className="w-full border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
                      value={duplicateToDate}
                      onChange={(e) => setDuplicateToDate(e.target.value)}
                    />
                    <div className="text-xs text-white/40 mt-1">
                      Hasta lunes {getWeekKey(duplicateToDate)}
                    </div>
                  </div>

                  <button
                    onClick={duplicateWeek}
                    disabled={duplicating || loading}
                    className="rounded-xl bg-white text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {duplicating ? "Duplicando..." : "Duplicar semana"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}