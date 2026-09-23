"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { getMyCompanyAccess } from "@/lib/companyAccess";
import CompanyBlocked from "@/components/CompanyBlocked";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";
import { Coffee, LogIn, LogOut, Play, Clock3 } from "lucide-react";

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
    if (e.entry_type === "BREAK_START" && inAt) breakAt = t;
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
    if (breakAt) breakSeconds += (now.getTime() - breakAt.getTime()) / 1000;
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

function formatClock(d: Date) {
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function formatLongDate(d: Date) {
  const s = d.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ClockPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const opInFlight = useRef(false);

  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lastType, setLastType] = useState<EntryType | undefined>(undefined);
  const [userActive, setUserActive] = useState(true);
  const [activeChecked, setActiveChecked] = useState(false);
  const [nowTick, setNowTick] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const status = useMemo(() => statusFromLast(lastType), [lastType]);

  const statusMeta = useMemo(() => {
    if (!activeChecked) return { label: "Cargando…", tone: "neutral" as const };
    if (!userActive) return { label: "Cuenta desactivada", tone: "danger" as const };
    if (status === "OFF") return { label: "Jornada no iniciada", tone: "neutral" as const };
    if (status === "ON") return { label: "Trabajando", tone: "success" as const };
    return { label: "En pausa", tone: "warning" as const };
  }, [status, userActive, activeChecked]);

  const totals = useMemo(() => {
    const asc = [...entries].reverse();
    return computeTotals(asc, nowTick);
  }, [entries, nowTick]);

  const entryTime = useMemo(() => {
    const asc = [...entries].reverse();
    const firstIn = asc.find((e) => e.entry_type === "IN");
    return firstIn ? new Date(firstIn.ts) : null;
  }, [entries]);

  const notifyErr = (err: unknown) => {
    toastError(userFacingError(err));
  };

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
      notifyErr(error);
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
      notifyErr(shiftErr);
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
        notifyErr(teErr);
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
        setBooting(false);
        return;
      }
      await loadState();
      setBooting(false);
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

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        router.push("/login?next=/clock");
        return;
      }

      const { data: openShifts, error: openErr } = await supabase
        .from("shifts")
        .select("id")
        .eq("user_id", uid)
        .is("ended_at", null)
        .limit(1);

      if (openErr) {
        notifyErr(openErr);
        return;
      }
      if (openShifts && openShifts.length > 0) {
        toastError("Ya tienes un turno abierto. No se puede fichar otra entrada.");
        await loadState();
        return;
      }
      if (status !== "OFF") {
        toastError("Acción no permitida según tu estado actual.");
        return;
      }

      const { data: shiftRows, error: shiftErr } = await supabase
        .from("shifts")
        .insert({ user_id: uid })
        .select("id")
        .limit(1);

      if (shiftErr) {
        notifyErr(shiftErr);
        return;
      }

      const shiftId = shiftRows?.[0]?.id;
      if (!shiftId) {
        toastError("No se pudo crear el turno.");
        return;
      }

      const { error: teErr } = await supabase.from("time_entries").insert({
        user_id: uid,
        entry_type: "IN",
        shift_id: shiftId,
      });

      if (teErr) {
        notifyErr(teErr);
        return;
      }

      await loadState();
      success(`Entrada registrada a las ${formatClock(new Date())}`);
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

      const { data: openShifts, error: openErr } = await supabase
        .from("shifts")
        .select("id")
        .eq("user_id", uid)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1);

      if (openErr) {
        notifyErr(openErr);
        return;
      }

      const currentShiftId = openShifts?.[0]?.id ?? null;
      if (!currentShiftId) {
        toastError("No hay turno activo. Primero marca Entrada.");
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
        notifyErr(teLoadErr);
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
        toastError("Acción no permitida según tu estado actual.");
        await loadState();
        return;
      }

      const { error: teErr } = await supabase.from("time_entries").insert({
        user_id: uid,
        entry_type: type,
        shift_id: currentShiftId,
      });

      if (teErr) {
        notifyErr(teErr);
        return;
      }

      if (type === "OUT") {
        const { error: closeErr } = await supabase
          .from("shifts")
          .update({ ended_at: new Date().toISOString() })
          .eq("id", currentShiftId)
          .eq("user_id", uid)
          .is("ended_at", null);

        if (closeErr) {
          notifyErr(closeErr);
          return;
        }
      }

      await loadState();
      const msg =
        type === "BREAK_START"
          ? `Pausa iniciada a las ${formatClock(new Date())}`
          : type === "BREAK_END"
            ? `Jornada reanudada a las ${formatClock(new Date())}`
            : `Jornada finalizada a las ${formatClock(new Date())}`;
      success(msg);
    } finally {
      setLoading(false);
      opInFlight.current = false;
    }
  };

  const actionsDisabled = loading || !activeChecked || !userActive || blocked;

  if (blocked) return <CompanyBlocked />;
  if (booting) return <PageSkeleton />;

  const primaryAction =
    status === "OFF"
      ? {
          label: "Entrar",
          onClick: punchIn,
          icon: LogIn,
          variant: "accent" as const,
        }
      : status === "BREAK"
        ? {
            label: "Reanudar",
            onClick: () => punch("BREAK_END"),
            icon: Play,
            variant: "accent" as const,
          }
        : {
            label: "Finalizar jornada",
            onClick: () => punch("OUT"),
            icon: LogOut,
            variant: "primary" as const,
          };

  const PrimaryIcon = primaryAction.icon;
  const timeline = [...entries].reverse();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {!userActive && activeChecked ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          Tu cuenta está desactivada. Contacta con tu administrador.
        </div>
      ) : null}

      <Card className="overflow-hidden text-center">
        <div className="mx-auto max-w-md">
          <div className="text-[3.5rem] font-semibold leading-none tracking-tight tabular-nums sm:text-6xl">
            {formatClock(nowTick)}
          </div>
          <div className="mt-3 text-sm text-[var(--text-secondary)]">{formatLongDate(nowTick)}</div>

          <div className="mt-5 flex items-center justify-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                status === "ON"
                  ? "bg-[var(--success)]"
                  : status === "BREAK"
                    ? "bg-[var(--warning)]"
                    : "bg-[var(--text-muted)]"
              }`}
            />
            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
          </div>

          <div className="mt-8 space-y-3">
            <Button
              variant={primaryAction.variant}
              size="xl"
              className="w-full min-h-[3.5rem] text-base"
              onClick={primaryAction.onClick}
              disabled={actionsDisabled}
              loading={loading}
            >
              <PrimaryIcon className="h-5 w-5" />
              {primaryAction.label}
            </Button>

            {status === "ON" ? (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => punch("BREAK_START")}
                disabled={actionsDisabled}
                loading={loading}
              >
                <Coffee className="h-4 w-4" />
                Iniciar pausa
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="!p-4">
          <div className="text-[11px] text-[var(--text-muted)]">Entrada</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {entryTime ? formatClock(entryTime) : "—"}
          </div>
        </Card>
        <Card className="!p-4">
          <div className="text-[11px] text-[var(--text-muted)]">Trabajado</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--success)]">
            {formatHHMMSS(totals.netSeconds)}
          </div>
        </Card>
        <Card className="!p-4">
          <div className="text-[11px] text-[var(--text-muted)]">En pausa</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--warning)]">
            {formatHHMMSS(totals.breakSeconds)}
          </div>
        </Card>
        <Card className="!p-4">
          <div className="text-[11px] text-[var(--text-muted)]">Bruto</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {formatHHMMSS(totals.workSeconds)}
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-[var(--text-muted)]" />
          <h2 className="text-sm font-semibold">Timeline del día</h2>
        </div>
        {timeline.length === 0 ? (
          <EmptyState
            title="Sin movimientos todavía"
            description="Cuando marques la entrada, verás aquí el historial de la jornada."
          />
        ) : (
          <ol className="relative space-y-0 border-l border-[var(--border)] pl-5">
            {timeline.map((e) => (
              <li key={e.id} className="relative pb-5 last:pb-0">
                <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{entryTypeLabel(e.entry_type)}</div>
                  </div>
                  <div className="text-sm tabular-nums text-[var(--text-secondary)]">
                    {new Date(e.ts).toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
