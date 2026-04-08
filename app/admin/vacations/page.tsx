"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type ProfileLite = {
  user_id: string;
  full_name: string | null;
  dni: string | null;
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

export default function AdminVacationsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [workers, setWorkers] = useState<ProfileLite[]>([]);
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({});
  const [dniByUser, setDniByUser] = useState<Record<string, string>>({});

  const [requests, setRequests] = useState<VacationReq[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [adminNoteById, setAdminNoteById] = useState<Record<string, string>>({});

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

      const { data: wRows, error: wErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, dni")
        .order("full_name", { ascending: true });

      if (wErr) throw new Error(wErr.message);

      const w = ((wRows ?? []) as ProfileLite[]);
      setWorkers(w);

      const nMap: Record<string, string> = {};
      const dMap: Record<string, string> = {};
      w.forEach((p) => {
        nMap[p.user_id] = p.full_name?.trim() || p.user_id.slice(0, 8);
        dMap[p.user_id] = (p.dni || "").trim();
      });
      setNameByUser(nMap);
      setDniByUser(dMap);

      const { data: reqRows, error: rErr } = await supabase
        .from("vacation_requests")
        .select("id,user_id,start_date,end_date,days,status,note,admin_note,created_at")
        .order("start_date", { ascending: true });

      if (rErr) throw new Error(rErr.message);
      setRequests((reqRows ?? []) as VacationReq[]);

      const { data: balRows, error: bErr } = await supabase
        .from("vacation_balances")
        .select("user_id, year, entitled_days, carried_over_days")
        .eq("year", currentYear)
        .order("user_id", { ascending: true });

      if (bErr) throw new Error(bErr.message);
      setBalances((balRows ?? []) as BalanceRow[]);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = useMemo(() => requests.filter((r) => r.status === "PENDING"), [requests]);

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

  const decide = async (r: VacationReq, decision: "APPROVED" | "REJECTED") => {
    const ok = confirm(decision === "APPROVED" ? "¿Aprobar solicitud?" : "¿Rechazar solicitud?");
    if (!ok) return;

    const admin_note = (adminNoteById[r.id] || "").trim() || null;

    const { error } = await supabase.rpc("decide_vacation_request", {
      p_request_id: r.id,
      p_decision: decision,
      p_admin_note: admin_note,
    });

    if (error) {
      alert(error.message);
      return;
    }

    await load();
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white">Vacaciones equipo</h2>
          <p className="text-sm text-white/60">
            Pendientes: <b className="text-white">{pending.length}</b> · Año:{" "}
            <b className="text-white">{currentYear}</b>
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={load}
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white hover:bg-white/[0.10] transition"
          >
            Recargar
          </button>
          <a
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white hover:bg-white/[0.10] transition"
            href="/admin/users"
          >
            Usuarios
          </a>
          <a
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white hover:bg-white/[0.10] transition"
            href="/admin/shifts"
          >
            Turnos
          </a>
          <a
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white hover:bg-white/[0.10] transition"
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

      <div className="border border-white/10 rounded-2xl p-4 mb-6 bg-black/20">
        <div className="font-bold mb-3 text-white">Filtro</div>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <div className="text-xs text-white/60 mb-1">Trabajador</div>
            <select
              className="border border-white/10 rounded-xl px-3 py-2 text-sm min-w-[260px] bg-white/[0.04] text-white"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Todos</option>
              {workers.map((w) => (
                <option key={w.user_id} value={w.user_id}>
                  {(w.full_name?.trim() || w.user_id.slice(0, 8)) + (w.dni ? ` (${w.dni})` : "")}
                </option>
              ))}
            </select>
          </div>

          <div className="text-sm text-white/60">
            Mostrando: <b className="text-white">{visibleRequests.length}</b> solicitudes
          </div>
        </div>
      </div>

      <div className="border border-white/10 rounded-2xl p-4 mb-6 bg-black/20">
        <div className="font-bold mb-3 text-white">Solicitudes pendientes</div>

        {loading ? (
          <p className="text-white/70">Cargando...</p>
        ) : pending.length === 0 ? (
          <p className="text-white/50">No hay solicitudes pendientes.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => {
              const who = nameByUser[r.user_id] || r.user_id.slice(0, 8);
              const dni = dniByUser[r.user_id] || "—";

              return (
                <div key={r.id} className="border border-white/10 rounded-xl p-4 bg-white/[0.03]">
                  <div className="font-bold text-white">
                    {who} <span className="text-xs text-white/50">({dni})</span>
                  </div>

                  <div className="text-sm text-white/70 mt-1">
                    {fmt(r.start_date)} → {fmt(r.end_date)} · Días:{" "}
                    <b className="text-white">{Number(r.days || 0).toFixed(2)}</b>
                  </div>

                  {r.note && <div className="text-sm text-white/60 mt-1">Nota: {r.note}</div>}

                  <div className="flex gap-2 flex-wrap items-center mt-3">
                    <input
                      className="border border-white/10 rounded-xl px-3 py-2 text-sm flex-1 min-w-[240px] bg-white/[0.04] text-white"
                      placeholder="Nota admin (opcional)"
                      value={adminNoteById[r.id] ?? ""}
                      onChange={(e) =>
                        setAdminNoteById((prev) => ({ ...prev, [r.id]: e.target.value }))
                      }
                    />

                    <button
                      className="rounded-xl bg-white text-black px-3 py-2 text-sm font-medium"
                      onClick={() => decide(r, "APPROVED")}
                    >
                      Aprobar
                    </button>

                    <button
                      className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/[0.06] transition"
                      onClick={() => decide(r, "REJECTED")}
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border border-white/10 rounded-2xl p-4 mb-6 bg-black/20">
        <div className="font-bold mb-3 text-white">Saldo vacaciones ({currentYear})</div>

        {workers.length === 0 ? (
          <p className="text-white/50">No hay trabajadores.</p>
        ) : (
          <div className="space-y-3">
            {workers.map((w) => {
              const b = balanceByUser[w.user_id];
              const entitled = Number((b?.entitled_days ?? 30) + (b?.carried_over_days ?? 0));
              const taken = Number(approvedTakenByUserThisYear[w.user_id] ?? 0);
              const remaining = entitled - taken;

              return (
                <div
                  key={w.user_id}
                  className="border border-white/10 rounded-xl p-4 bg-white/[0.03] flex justify-between items-center gap-4"
                >
                  <div>
                    <div className="font-bold text-white">
                      {w.full_name?.trim() || w.user_id.slice(0, 8)}{" "}
                      <span className="text-xs text-white/50">{w.dni ? `(${w.dni})` : ""}</span>
                    </div>
                    <div className="text-sm text-white/60 mt-1">
                      Asignados: <b className="text-white">{entitled.toFixed(2)}</b> · Consumidos:{" "}
                      <b className="text-white">{taken.toFixed(2)}</b> · Restantes:{" "}
                      <b className="text-white">{remaining.toFixed(2)}</b>
                    </div>
                  </div>

                  <div className="text-xs text-white/40">
                    * El balance se crea automáticamente al aprobar la primera solicitud.
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border border-white/10 rounded-2xl p-4 bg-black/20">
        <div className="font-bold mb-3 text-white">Calendario (lista)</div>

        {loading ? (
          <p className="text-white/70">Cargando...</p>
        ) : visibleRequests.length === 0 ? (
          <p className="text-white/50">No hay solicitudes.</p>
        ) : (
          <div className="space-y-3">
            {visibleRequests.map((r) => {
              const who = nameByUser[r.user_id] || r.user_id.slice(0, 8);
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
                <div key={r.id} className="border border-white/10 rounded-xl p-4 bg-white/[0.03]">
                  <div className="font-bold flex flex-wrap gap-2 items-center text-white">
                    <span>{who}</span>
                    <span className="text-xs px-2 py-1 border border-white/10 rounded-full text-white/80">
                      {statusLabel}
                    </span>
                  </div>
                  <div className="text-sm text-white/70 mt-1">
                    {fmt(r.start_date)} → {fmt(r.end_date)} · Días:{" "}
                    <b className="text-white">{Number(r.days || 0).toFixed(2)}</b>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}