"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

function badgeColor(status: string) {
  switch (status) {
    case "OK":
      return "bg-green-500/20 text-green-300 border-green-500/30";
    case "TARDE":
      return "bg-yellow-500/20 text-yellow-200 border-yellow-500/30";
    case "ENTRADA_ANTICIPADA":
      return "bg-blue-500/20 text-blue-200 border-blue-500/30";
    case "HORAS_EXTRA":
      return "bg-blue-500/20 text-blue-200 border-blue-500/30";
    case "ABIERTO":
      return "bg-orange-500/20 text-orange-200 border-orange-500/30";
    case "TURNO_INCOMPLETO":
      return "bg-orange-500/20 text-orange-200 border-orange-500/30";
    case "NO_FICHAJE":
      return "bg-red-500/20 text-red-200 border-red-500/30";
    case "SALIDA_ANTICIPADA":
      return "bg-orange-500/20 text-orange-200 border-orange-500/30";
    case "FUERA_DE_TURNO":
      return "bg-red-500/20 text-red-200 border-red-500/30";
    default:
      return "bg-white/10 text-white border-white/10";
  }
}

export default function PlannedVsRealPage() {
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
        window.location.href = "/login";
        return;
      }

      const userId = sess.session.user.id;

      const { data: me } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!me?.company_id) {
        throw new Error("No hay empresa.");
      }

      const { data: workerRows } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("company_id", me.company_id)
        .order("full_name", { ascending: true });

      setWorkers(workerRows || []);

      let query = supabase
        .from("shift_plan_vs_real")
        .select("*")
        .eq("company_id", me.company_id)
        .gte("planned_date", dateFrom)
        .lte("planned_date", dateTo)
        .order("planned_date", { ascending: false });

      if (selectedUserId) query = query.eq("user_id", selectedUserId);
      if (selectedStatus) query = query.eq("status", selectedStatus);

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      setRows((data || []) as Row[]);
    } catch (e: any) {
      setErrorMsg(e?.message || "Error");
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

  return (
    <main className="min-h-screen bg-[#111827] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
            <div>
              <div className="text-white/60 text-xs">Fichagest · Control avanzado</div>

              <h1 className="text-3xl font-bold text-white mt-1">Comparador de turnos</h1>

              <p className="text-white/60 mt-1">
                Comparación automática entre turnos planificados y fichajes reales.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={load}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white"
              >
                Recargar
              </button>

              <a
                href="/admin/planned-shifts"
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white"
              >
                Planificación
              </a>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-100">
              {errorMsg}
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-black/20 p-5 mb-6">
            <div className="font-bold text-white mb-4">Filtros</div>

            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <div className="text-xs text-white/60 mb-1">Desde</div>
                <input
                  type="date"
                  className="border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs text-white/60 mb-1">Hasta</div>
                <input
                  type="date"
                  className="border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs text-white/60 mb-1">Trabajador</div>
                <select
                  className="border border-white/10 rounded-xl px-3 py-2 text-sm min-w-[220px] bg-white/[0.04] text-white"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">Todos</option>
                  {workers.map((w) => (
                    <option key={w.user_id} value={w.user_id}>
                      {w.full_name || w.user_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs text-white/60 mb-1">Estado</div>
                <select
                  className="border border-white/10 rounded-xl px-3 py-2 text-sm min-w-[220px] bg-white/[0.04] text-white"
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
                </select>
              </div>

              <button
                className="rounded-xl bg-white text-black px-4 py-2 text-sm font-medium"
                onClick={load}
                disabled={loading || !dateFrom || !dateTo}
              >
                Aplicar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-white/60 text-xs">Total</div>
              <div className="text-white text-2xl font-bold mt-1">{summary.total}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-white/60 text-xs">Incidencias</div>
              <div className="text-white text-2xl font-bold mt-1">{summary.incidences}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-white/60 text-xs">Sin fichaje</div>
              <div className="text-red-100 text-2xl font-bold mt-1">{summary.noClock}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-white/60 text-xs">Retrasos</div>
              <div className="text-yellow-100 text-2xl font-bold mt-1">{summary.late}</div>
            </div>
          </div>

          {loading ? (
            <div className="text-white/70">Cargando...</div>
          ) : rows.length === 0 ? (
            <div className="text-white/50">No hay datos con estos filtros.</div>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <div
                  key={r.planned_shift_id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-5"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="text-white font-semibold">{workerName(r.user_id)}</div>

                      <div className="text-white/60 text-sm mt-1">{r.planned_date}</div>

                      <div className="text-white/80 text-sm mt-3">
                        Planificado:{" "}
                        <b>
                          {r.planned_start.slice(0, 5)} - {r.planned_end.slice(0, 5)}
                        </b>
                      </div>

                      <div className="text-white/80 text-sm mt-1">
                        Real:{" "}
                        <b>
                          {r.started_at
                            ? new Date(r.started_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "--:--"}
                          {" - "}
                          {r.ended_at
                            ? new Date(r.ended_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "--:--"}
                        </b>
                      </div>

                      {r.late_minutes !== null && r.late_minutes > 0 && (
                        <div className="text-yellow-200 text-sm mt-2">
                          Retraso: {r.late_minutes} min
                        </div>
                      )}

                      {r.early_entry_minutes !== null && r.early_entry_minutes > 0 && (
                        <div className="text-blue-200 text-sm mt-1">
                          Entrada anticipada: {r.early_entry_minutes} min
                        </div>
                      )}

                      {r.early_leave_minutes !== null && r.early_leave_minutes > 0 && (
                        <div className="text-orange-200 text-sm mt-1">
                          Salida anticipada: {r.early_leave_minutes} min
                        </div>
                      )}

                      {r.extra_minutes !== null && r.extra_minutes > 0 && (
                        <div className="text-blue-200 text-sm mt-1">
                          Tiempo adicional: {r.extra_minutes} min
                        </div>
                      )}
                    </div>

                    <div>
                      <div
                        className={`px-3 py-1 rounded-full border text-sm font-medium ${badgeColor(
                          r.status
                        )}`}
                      >
                        {statusLabel(r.status)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}