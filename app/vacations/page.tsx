"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { getMyCompanyAccess } from "@/lib/companyAccess";
import CompanyBlocked from "@/components/CompanyBlocked";

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
};

function fmt(d: string) {
  return d;
}

export default function VacationsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [rows, setRows] = useState<VacationRow[]>([]);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

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

      const { data, error } = await supabase
        .from("vacation_calendar")
        .select("id,user_id,start_date,end_date,days,status,note,admin_note,created_at")
        .order("start_date", { ascending: true });

      if (error) throw new Error(error.message);

      setRows((data ?? []) as VacationRow[]);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error inesperado");
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

  const submit = async () => {
    setErrorMsg(null);

    if (!startDate || !endDate) {
      alert("Selecciona fecha de inicio y fin.");
      return;
    }

    if (endDate < startDate) {
      alert("La fecha fin no puede ser anterior a la de inicio.");
      return;
    }

    const ok = confirm("¿Enviar solicitud de vacaciones?");
    if (!ok) return;

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
      alert(error.message);
      return;
    }

    setStartDate("");
    setEndDate("");
    setNote("");
    await load();
    alert("Solicitud enviada ✅");
  };

  const cancelRequest = async (r: VacationRow) => {
    if (r.status !== "PENDING") {
      alert("Solo puedes cancelar solicitudes PENDIENTES.");
      return;
    }

    const ok = confirm("¿Cancelar esta solicitud?");
    if (!ok) return;

    const access = await getMyCompanyAccess();
    if (access.blocked) {
      setBlocked(true);
      return;
    }

    const { error } = await supabase
      .from("vacation_requests")
      .update({ status: "CANCELLED" })
      .eq("id", r.id);

    if (error) {
      alert(error.message);
      return;
    }

    await load();
  };

  const pendingCount = useMemo(() => rows.filter((r) => r.status === "PENDING").length, [rows]);
  const approvedCount = useMemo(() => rows.filter((r) => r.status === "APPROVED").length, [rows]);

  if (blocked) {
    return <CompanyBlocked />;
  }

  return (
    <main className="min-h-screen bg-[#111827] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
            <div>
              <div className="text-white/60 text-xs">Fichagest · by Iberogest</div>
              <h1 className="text-3xl font-bold text-white mt-1">Mis vacaciones</h1>
              <p className="text-white/60 mt-1">
                Pendientes: <b className="text-white">{pendingCount}</b> · Aprobadas:{" "}
                <b className="text-white">{approvedCount}</b>
              </p>
            </div>

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={load}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
              >
                Recargar
              </button>

              <a
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
                href="/app"
              >
                Panel
              </a>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl border border-red-500/30 text-red-100 bg-red-500/10">
              {errorMsg}
            </div>
          )}

          <div className="border border-white/10 rounded-2xl p-5 mb-6 bg-black/20">
            <div className="font-bold mb-3 text-white">Solicitar vacaciones</div>

            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <div className="text-xs text-white/60 mb-1">Inicio</div>
                <input
                  type="date"
                  className="border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs text-white/60 mb-1">Fin</div>
                <input
                  type="date"
                  className="border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="min-w-[280px] flex-1">
                <div className="text-xs text-white/60 mb-1">Nota (opcional)</div>
                <input
                  className="border border-white/10 rounded-xl px-3 py-2 text-sm w-full bg-white/[0.04] text-white"
                  placeholder="Ej: viaje / asuntos personales…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <button
                className="rounded-xl bg-white text-black px-4 py-2 text-sm font-medium"
                onClick={submit}
              >
                Enviar solicitud
              </button>
            </div>

            <p className="text-xs text-white/50 mt-3">
              * Cálculo por <b className="text-white">días naturales</b> (incluye fines de semana).
            </p>
          </div>

          {loading ? (
            <p className="text-white/70">Cargando...</p>
          ) : rows.length === 0 ? (
            <p className="text-white/50">No hay solicitudes todavía.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => {
                const statusLabel =
                  r.status === "PENDING"
                    ? "Pendiente"
                    : r.status === "APPROVED"
                    ? "Aprobada"
                    : r.status === "REJECTED"
                    ? "Rechazada"
                    : r.status === "CANCELLED"
                    ? "Cancelada"
                    : r.status;

                return (
                  <div
                    key={r.id}
                    className="border border-white/10 rounded-2xl p-4 bg-black/20 flex justify-between items-center gap-4"
                  >
                    <div>
                      <div className="font-semibold text-white">
                        {fmt(r.start_date)} → {fmt(r.end_date)}
                        <span className="ml-2 text-xs px-2 py-1 border border-white/10 rounded-full text-white/80">
                          {statusLabel}
                        </span>
                      </div>

                      <div className="text-sm text-white/60 mt-1">
                        Días: <b className="text-white">{Number(r.days || 0).toFixed(2)}</b>
                      </div>

                      {(r.note || r.admin_note) && (
                        <div className="text-sm text-white/70 mt-3 space-y-1">
                          {r.note && (
                            <div>
                              <span className="text-white/50">Tu nota:</span> {r.note}
                            </div>
                          )}
                          {r.admin_note && (
                            <div>
                              <span className="text-white/50">Nota admin:</span> {r.admin_note}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {r.status === "PENDING" && (
                        <button
                          className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/[0.06] transition"
                          onClick={() => cancelRequest(r)}
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}