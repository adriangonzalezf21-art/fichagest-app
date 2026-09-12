"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { getMyCompanyAccess } from "@/lib/companyAccess";
import CompanyBlocked from "@/components/CompanyBlocked";

type EntryType = "IN" | "BREAK_START" | "BREAK_END" | "OUT";
type Entry = { id: string; entry_type: EntryType; ts: string; shift_id: string };

type Status = "OFF" | "ON" | "BREAK";

function formatHHMMSS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function computeTotals(entriesAsc: { entry_type: string; ts: string }[], now: Date) {
  let workSeconds = 0;
  let breakSeconds = 0;

  let inAt: Date | null = null;
  let breakAt: Date | null = null;

  for (const e of entriesAsc) {
    const t = new Date(e.ts);

    if (e.entry_type === "IN") {
      inAt = t;
      breakAt = null;
    }

    if (e.entry_type === "BREAK_START" && inAt) {
      breakAt = t;
    }

    if (e.entry_type === "BREAK_END" && inAt && breakAt) {
      breakSeconds += (t.getTime() - breakAt.getTime()) / 1000;
      breakAt = null;
    }

    if (e.entry_type === "OUT" && inAt) {
      workSeconds += (t.getTime() - inAt.getTime()) / 1000;

      if (breakAt) {
        breakSeconds += (t.getTime() - breakAt.getTime()) / 1000;
        breakAt = null;
      }

      inAt = null;
    }
  }

  if (inAt) {
    workSeconds += (now.getTime() - inAt.getTime()) / 1000;
    if (breakAt) {
      breakSeconds += (now.getTime() - breakAt.getTime()) / 1000;
    }
  }

  const netSeconds = Math.max(0, workSeconds - breakSeconds);

  return {
    workSeconds: Math.floor(workSeconds),
    breakSeconds: Math.floor(breakSeconds),
    netSeconds: Math.floor(netSeconds),
  };
}

function statusFromLast(lastType?: EntryType): Status {
  if (!lastType || lastType === "OUT") return "OFF";
  if (lastType === "BREAK_START") return "BREAK";
  return "ON";
}

function entryTypeLabel(type: EntryType) {
  switch (type) {
    case "IN":
      return "Entrada";
    case "BREAK_START":
      return "Inicio descanso";
    case "BREAK_END":
      return "Fin descanso";
    case "OUT":
      return "Salida";
    default:
      return type;
  }
}

function entryTypeSubLabel(type: EntryType) {
  switch (type) {
    case "IN":
      return "Inicio de jornada";
    case "BREAK_START":
      return "Descanso iniciado";
    case "BREAK_END":
      return "Descanso finalizado";
    case "OUT":
      return "Jornada finalizada";
    default:
      return "Movimiento registrado";
  }
}

export default function ClockPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const opInFlight = useRef(false);

  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lastType, setLastType] = useState<EntryType | undefined>(undefined);

  const [userActive, setUserActive] = useState<boolean>(true);
  const [activeChecked, setActiveChecked] = useState<boolean>(false);

  const [nowTick, setNowTick] = useState<Date>(new Date());

  // NOTA SEGURIDAD: la atomicidad real (un solo turno abierto, OUT sin IN, etc.)
  // requiere constraints/RPC en base de datos + RLS. Esto solo reduce abusos desde la UI.

  useEffect(() => {
    if (!activeShiftId) return;
    const id = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(id);
  }, [activeShiftId]);

  const status = useMemo(() => statusFromLast(lastType), [lastType]);

  const statusLabel = useMemo(() => {
    if (!activeChecked) return "Cargando...";
    if (!userActive) return "Cuenta desactivada";
    if (status === "OFF") return "Fuera de turno";
    if (status === "ON") return "Turno en curso";
    return "En descanso";
  }, [status, userActive, activeChecked]);

  const totals = useMemo(() => {
    const asc = [...entries].reverse();
    return computeTotals(asc, nowTick);
  }, [entries, nowTick]);

  const ensureActive = async (): Promise<boolean> => {
    const access = await getMyCompanyAccess();

    if (!access.session) return false;

    if (access.blocked) {
      setBlocked(true);
      return false;
    }

    setBlocked(false);

    const { data: prof, error } = await supabase
      .from("profiles")
      .select("active")
      .eq("user_id", access.session.user.id)
      .maybeSingle<{ active: boolean | null }>();

    if (error) {
      alert(error.message);
      return false;
    }

    const isActive = prof?.active !== false;
    setUserActive(isActive);
    setActiveChecked(true);

    return isActive;
  };

  const loadState = async () => {
    const access = await getMyCompanyAccess();

    if (!access.session) {
      router.push("/login?next=/clock");
      return;
    }

    if (access.blocked) {
      setBlocked(true);
      setActiveShiftId(null);
      setEntries([]);
      setLastType(undefined);
      setNowTick(new Date());
      setActiveChecked(true);
      return;
    }

    setBlocked(false);

    const ok = await ensureActive();
    if (!ok) {
      setActiveShiftId(null);
      setEntries([]);
      setLastType(undefined);
      setNowTick(new Date());
      return;
    }

    const uid = access.session.user.id;

    const { data: shifts, error: shiftErr } = await supabase
      .from("shifts")
      .select("id")
      .eq("user_id", uid)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1);

    if (shiftErr) {
      alert(shiftErr.message);
      return;
    }

    const currentShiftId = shifts?.[0]?.id ?? null;
    setActiveShiftId(currentShiftId);

    if (currentShiftId) {
      const { data: te, error: teErr } = await supabase
        .from("time_entries")
        .select("id, entry_type, ts, shift_id")
        .eq("shift_id", currentShiftId)
        .order("ts", { ascending: false });

      if (teErr) {
        alert(teErr.message);
        return;
      }

      const list = (te ?? []) as Entry[];
      setEntries(list);
      setLastType(list[0]?.entry_type);
      setNowTick(new Date());
    } else {
      setEntries([]);
      setLastType(undefined);
      setNowTick(new Date());
    }
  };

  useEffect(() => {
    const init = async () => {
      const access = await getMyCompanyAccess();

      if (!access.session) {
        router.push("/login?next=/clock");
        return;
      }

      if (access.blocked) {
        setBlocked(true);
        setActiveChecked(true);
        return;
      }

      await loadState();
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const punchIn = async () => {
    if (opInFlight.current || loading) return;
    opInFlight.current = true;
    setLoading(true);

    try {
      const ok = await ensureActive();
      if (!ok) return;

      // user_id siempre desde Auth — nunca desde formulario/URL/localStorage.
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        router.push("/login?next=/clock");
        return;
      }

      // Reconsultar estado: no permitir IN si ya hay turno abierto (defense-in-depth).
      const { data: openShifts, error: openErr } = await supabase
        .from("shifts")
        .select("id")
        .eq("user_id", uid)
        .is("ended_at", null)
        .limit(1);

      if (openErr) {
        alert(openErr.message);
        return;
      }

      if (openShifts && openShifts.length > 0) {
        alert("Ya tienes un turno abierto. No se puede fichar otra entrada.");
        await loadState();
        return;
      }

      if (status !== "OFF") {
        alert("Acción no permitida según tu estado actual.");
        return;
      }

      // No enviamos company_id ni timestamps editables desde el cliente.
      // started_at / ts deben resolverse en DB (default now()) cuando exista.
      const { data: shiftRows, error: shiftErr } = await supabase
        .from("shifts")
        .insert({ user_id: uid })
        .select("id")
        .limit(1);

      if (shiftErr) {
        alert(shiftErr.message);
        return;
      }

      const shiftId = shiftRows?.[0]?.id;
      if (!shiftId) {
        alert("No se pudo crear el turno.");
        return;
      }

      const { error: teErr } = await supabase.from("time_entries").insert({
        user_id: uid,
        entry_type: "IN",
        shift_id: shiftId,
      });

      if (teErr) {
        alert(teErr.message);
        return;
      }

      await loadState();
    } finally {
      setLoading(false);
      opInFlight.current = false;
    }
  };

  const punch = async (type: Exclude<EntryType, "IN">) => {
    if (opInFlight.current || loading) return;
    opInFlight.current = true;
    setLoading(true);

    try {
      const ok = await ensureActive();
      if (!ok) return;

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        router.push("/login?next=/clock");
        return;
      }

      // Releer turno abierto del propio usuario (no confiar solo en state local).
      const { data: openShifts, error: openErr } = await supabase
        .from("shifts")
        .select("id")
        .eq("user_id", uid)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1);

      if (openErr) {
        alert(openErr.message);
        return;
      }

      const currentShiftId = openShifts?.[0]?.id ?? null;
      if (!currentShiftId) {
        alert("No hay turno activo. Primero marca Entrada.");
        await loadState();
        return;
      }

      const { data: te, error: teLoadErr } = await supabase
        .from("time_entries")
        .select("id, entry_type, ts, shift_id")
        .eq("shift_id", currentShiftId)
        .eq("user_id", uid)
        .order("ts", { ascending: false })
        .limit(1);

      if (teLoadErr) {
        alert(teLoadErr.message);
        return;
      }

      const last = (te?.[0]?.entry_type as EntryType | undefined) ?? undefined;
      const currentStatus = statusFromLast(last);

      const allowed: readonly Exclude<EntryType, "IN">[] =
        currentStatus === "ON"
          ? ["BREAK_START", "OUT"]
          : currentStatus === "BREAK"
            ? ["BREAK_END"]
            : [];

      if (!allowed.includes(type)) {
        alert("Acción no permitida según tu estado actual.");
        await loadState();
        return;
      }

      const { error: teErr } = await supabase.from("time_entries").insert({
        user_id: uid,
        entry_type: type,
        shift_id: currentShiftId,
      });

      if (teErr) {
        alert(teErr.message);
        return;
      }

      if (type === "OUT") {
        // Cerrar solo el turno abierto del usuario autenticado.
        // Idealmente ended_at = now() en DB; aquí evitamos IDs ajenos.
        const { error: closeErr } = await supabase
          .from("shifts")
          .update({ ended_at: new Date().toISOString() })
          .eq("id", currentShiftId)
          .eq("user_id", uid)
          .is("ended_at", null);

        if (closeErr) {
          alert(closeErr.message);
          return;
        }
      }

      await loadState();
    } finally {
      setLoading(false);
      opInFlight.current = false;
    }
  };

  const actionsDisabled = loading || !activeChecked || !userActive || blocked;

  if (blocked) {
    return <CompanyBlocked />;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl">Fichaje</h1>
            <p className="mt-1 text-[var(--text-secondary)]">
              Estado: <b className="text-[var(--text)]">{statusLabel}</b>
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Turno activo: <b className="text-[var(--text)]">{activeShiftId ? "Sí" : "No"}</b>
            </p>
          </div>
        </div>

        {!userActive && activeChecked && (
          <div className="mb-6 p-4 rounded-md border border-red-500/30 bg-red-500/10 text-red-100">
            Tu cuenta está <b>desactivada</b>. Contacta con tu administrador.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="border border-white/10 rounded-xl p-4 bg-black/20">
            <div className="text-sm text-white/60">Tiempo de turno</div>
            <div className="text-2xl font-bold text-white">{formatHHMMSS(totals.workSeconds)}</div>
          </div>

          <div className="border border-white/10 rounded-xl p-4 bg-black/20">
            <div className="text-sm text-white/60">Tiempo en descanso</div>
            <div className="text-2xl font-bold text-white">{formatHHMMSS(totals.breakSeconds)}</div>
          </div>

          <div className="border border-white/10 rounded-xl p-4 bg-black/20">
            <div className="text-sm text-white/60">Tiempo neto</div>
            <div className="text-2xl font-bold text-white">{formatHHMMSS(totals.netSeconds)}</div>
          </div>
        </div>

        <div className="flex gap-3 mb-8 flex-wrap">
          <button
            onClick={punchIn}
            disabled={actionsDisabled || status !== "OFF"}
            className="rounded-xl bg-white text-black py-3 px-4 font-medium disabled:opacity-40"
          >
            Entrada
          </button>

          <button
            onClick={() => punch("BREAK_START")}
            disabled={actionsDisabled || status !== "ON"}
            className="rounded-xl border border-white/10 py-3 px-4 text-white disabled:opacity-40"
          >
            Iniciar descanso
          </button>

          <button
            onClick={() => punch("BREAK_END")}
            disabled={actionsDisabled || status !== "BREAK"}
            className="rounded-xl border border-white/10 py-3 px-4 text-white disabled:opacity-40"
          >
            Finalizar descanso
          </button>

          <button
            onClick={() => punch("OUT")}
            disabled={actionsDisabled || status !== "ON"}
            className="rounded-xl border border-white/10 py-3 px-4 text-white disabled:opacity-40"
          >
            Salida
          </button>
        </div>

        <h2 className="text-xl font-bold mb-3 text-white">
          {activeShiftId ? "Movimientos del turno actual" : "Movimientos"}
        </h2>

        <div className="space-y-2">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex justify-between items-center gap-4 border border-white/10 rounded-xl p-4 bg-black/20 text-white"
            >
              <div>
                <div className="font-semibold text-white">{entryTypeLabel(e.entry_type)}</div>
                <div className="text-xs text-white/50 mt-1">
                  {entryTypeSubLabel(e.entry_type)}
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm text-white">
                  {new Date(e.ts).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>

                <div className="text-xs text-white/50 mt-1">
                  {new Date(e.ts).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}

          {entries.length === 0 && (
            <p className="text-white/50">
              {activeShiftId ? "Todavía no hay movimientos en este turno." : "No hay turno activo."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}