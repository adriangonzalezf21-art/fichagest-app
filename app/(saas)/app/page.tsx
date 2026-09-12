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
  Copy,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getMyCompanyAccess } from "@/lib/companyAccess";
import CompanyBlocked from "@/components/CompanyBlocked";
import { isCompanyAdmin } from "@/lib/authz";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { ErrorState, LoadingState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

type Profile = {
  role: "admin" | "worker" | string;
  company_id: string | null;
  full_name?: string | null;
  is_owner?: boolean | null;
};

type Company = {
  id?: string | null;
  name: string | null;
  join_code: string | null;
  cif: string | null;
  enable_shift_planning?: boolean | null;
};

type DashboardMetrics = {
  week_hours: string;
  month_hours: string;
  month_shifts: number;
  open_shifts: number;
  open_shifts_over_10h: number;
  pending_vac_company: number;
  my_pending_vac: number;
};

type CalendarDayRow = {
  day: string;
  shifts_total: number;
  vacations_total: number;
  vacations_pending: number;
  shift_names?: string[];
  vacation_names?: string[];
};

type ClockStatus = "OFF" | "ON" | "BREAK" | "UNKNOWN";

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonthExclusive(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

function MiniCalendar({
  days,
  monthDate,
  onPrevMonth,
  onNextMonth,
}: {
  days: CalendarDayRow[];
  monthDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const map = useMemo(() => {
    const m: Record<string, CalendarDayRow> = {};
    for (const r of days) m[r.day] = r;
    return m;
  }, [days]);

  const start = startOfMonth(monthDate);
  const endEx = endOfMonthExclusive(monthDate);
  const firstDow = (new Date(start.getFullYear(), start.getMonth(), 1).getDay() + 6) % 7;
  const totalDays = Math.round((endEx.getTime() - start.getTime()) / 86400000);

  const cells: Array<{ date: Date | null }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ date: null });
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ date: new Date(start.getFullYear(), start.getMonth(), d) });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null });

  const todayKey = ymd(new Date());

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--text)]">Calendario</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">Turnos y vacaciones del mes</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onPrevMonth} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[8.5rem] text-center text-xs text-[var(--text-secondary)]">
            {monthDate.toLocaleString("es-ES", { month: "long", year: "numeric" })}
          </div>
          <Button variant="ghost" size="sm" onClick={onNextMonth} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[11px] text-[var(--text-muted)]">
        {["L", "M", "X", "J", "V", "S", "D"].map((x) => (
          <div key={x}>{x}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {cells.map((c, idx) => {
          if (!c.date) {
            return (
              <div
                key={idx}
                className="h-[58px] rounded-[var(--radius-md)] border border-transparent bg-transparent"
              />
            );
          }

          const key = ymd(c.date);
          const r = map[key];
          const isToday = key === todayKey;
          const shifts = r?.shifts_total ?? 0;
          const vacs = r?.vacations_total ?? 0;
          const vacPend = r?.vacations_pending ?? 0;

          return (
            <div
              key={idx}
              className={`h-[58px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-1.5 ${
                isToday ? "ring-1 ring-[var(--accent)]" : ""
              }`}
              title={[
                key,
                shifts ? `Turnos: ${shifts}` : "",
                vacs ? `Vacaciones: ${vacs}` : "",
                vacPend ? `Pendientes: ${vacPend}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            >
              <div className="text-[11px] font-medium text-[var(--text-secondary)]">
                {c.date.getDate()}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {shifts > 0 ? (
                  <span className="rounded-full bg-[var(--info-soft)] px-1.5 text-[9px] text-[var(--info)]">
                    {shifts}
                  </span>
                ) : null}
                {vacs > 0 ? (
                  <span className="rounded-full bg-[var(--success-soft)] px-1.5 text-[9px] text-[var(--success)]">
                    {vacs}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function clockLabel(status: ClockStatus) {
  if (status === "ON") return { title: "Trabajando", tone: "success" as const };
  if (status === "BREAK") return { title: "En pausa", tone: "warning" as const };
  if (status === "OFF") return { title: "No fichado", tone: "neutral" as const };
  return { title: "Estado desconocido", tone: "neutral" as const };
}

export default function AppHome() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [calDays, setCalDays] = useState<CalendarDayRow[]>([]);
  const [calMonth, setCalMonth] = useState<Date>(new Date());
  const [pendingFixCompany, setPendingFixCompany] = useState<number | null>(null);
  const [pendingFixMine, setPendingFixMine] = useState<number | null>(null);
  const [clockStatus, setClockStatus] = useState<ClockStatus>("UNKNOWN");

  const isAdmin = isCompanyAdmin(profile);

  const inviteLink = useMemo(() => {
    if (!isAdmin || !company?.join_code || typeof window === "undefined") return "";
    return `${window.location.origin}/join?code=${encodeURIComponent(company.join_code)}`;
  }, [company?.join_code, isAdmin]);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const access = await getMyCompanyAccess();
      if (!access.session) {
        router.push("/login?next=/app");
        return;
      }
      if (access.blocked) {
        setBlocked(true);
        return;
      }

      setBlocked(false);
      const session = access.session;
      setEmail(session.user.email ?? "");

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role, company_id, full_name, is_owner")
        .eq("user_id", session.user.id)
        .maybeSingle<Profile>();

      if (profErr) throw new Error(profErr.message);
      if (!prof) throw new Error("No existe tu perfil.");

      setProfile(prof);

      if (prof.company_id) {
        const { data: comp, error: compErr } = await supabase
          .from("companies")
          .select("id, name, join_code, cif, enable_shift_planning")
          .eq("id", prof.company_id)
          .maybeSingle<Company>();
        if (compErr) throw new Error(compErr.message);
        setCompany(comp ?? null);
      } else {
        setCompany(null);
      }

      // Estado de fichaje personal (mismas tablas que /clock)
      const { data: openShifts } = await supabase
        .from("shifts")
        .select("id")
        .eq("user_id", session.user.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1);

      const openId = openShifts?.[0]?.id;
      if (!openId) {
        setClockStatus("OFF");
      } else {
        const { data: lastEntries } = await supabase
          .from("time_entries")
          .select("entry_type")
          .eq("shift_id", openId)
          .order("ts", { ascending: false })
          .limit(1);
        const last = lastEntries?.[0]?.entry_type;
        if (last === "BREAK_START") setClockStatus("BREAK");
        else if (last === "OUT") setClockStatus("OFF");
        else setClockStatus("ON");
      }

      const { data: m, error: mErr } = await supabase.rpc("get_dashboard_metrics");
      if (mErr) {
        console.warn("get_dashboard_metrics:", mErr.message);
        setMetrics(null);
      } else {
        setMetrics(m as DashboardMetrics);
      }

      try {
        const mineRes = await supabase
          .from("vacation_calendar")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING")
          .eq("user_id", session.user.id);
        if (!mineRes.error) setPendingFixMine(mineRes.count ?? 0);

        if (isCompanyAdmin(prof) && prof.company_id) {
          const { data: companyWorkers, error: wErr } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("company_id", prof.company_id);

          if (wErr) {
            setPendingFixCompany(null);
          } else {
            const ids = (companyWorkers ?? []).map((w) => w.user_id);
            if (ids.length === 0) setPendingFixCompany(0);
            else {
              const companyRes = await supabase
                .from("vacation_calendar")
                .select("id", { count: "exact", head: true })
                .eq("status", "PENDING")
                .in("user_id", ids);
              if (!companyRes.error) setPendingFixCompany(companyRes.count ?? 0);
            }
          }
        } else {
          setPendingFixCompany(null);
        }
      } catch (e: unknown) {
        console.warn("pendingFix:", e instanceof Error ? e.message : e);
      }

      const from = startOfMonth(calMonth);
      const toEx = endOfMonthExclusive(calMonth);
      const { data: cd, error: cdErr } = await supabase.rpc("get_dashboard_calendar_days", {
        p_from: ymd(from),
        p_to: ymd(new Date(toEx.getTime() - 86400000)),
      });

      if (cdErr) {
        console.warn("get_dashboard_calendar_days:", cdErr.message);
        setCalDays([]);
      } else {
        setCalDays((cd ?? []) as CalendarDayRow[]);
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, calMonth]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const displayName = profile?.full_name?.trim() || (email ? email.split("@")[0] : "Usuario");
  const weekHours = metrics?.week_hours ?? "00:00";
  const monthHours = metrics?.month_hours ?? "00:00";
  const monthShifts = metrics?.month_shifts ?? 0;
  const openShifts = metrics?.open_shifts ?? 0;
  const openOver10h = metrics?.open_shifts_over_10h ?? 0;
  const pendingVacCompany = pendingFixCompany ?? metrics?.pending_vac_company ?? 0;
  const myPendingVac = pendingFixMine ?? metrics?.my_pending_vac ?? 0;
  const clock = clockLabel(clockStatus);

  if (loading) return <LoadingState label="Cargando panel…" />;
  if (blocked) return <CompanyBlocked />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={`Hola, ${displayName}`}
        description="Resumen operativo de tu jornada y tu equipo."
        actions={
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
        }
      />

      {errorMsg ? <ErrorState message={errorMsg} onRetry={load} /> : null}

      {toast ? (
        <div className="fixed bottom-24 right-4 z-50 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] shadow-[var(--shadow-lg)] lg:bottom-6">
          {toast}
        </div>
      ) : null}

      {/* Primary clock CTA */}
      <Card className="overflow-hidden !p-0">
        <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr]">
          <div className="p-6 sm:p-8">
            <div className="mb-3 flex items-center gap-2">
              <Badge tone={clock.tone === "neutral" ? "neutral" : clock.tone}>{clock.title}</Badge>
              <span className="text-xs text-[var(--text-muted)]">Estado actual</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl">
              {clockStatus === "ON"
                ? "Tu jornada está en curso"
                : clockStatus === "BREAK"
                  ? "Estás en pausa"
                  : "Aún no has fichado"}
            </h2>
            <p className="mt-2 max-w-lg text-sm text-[var(--text-secondary)]">
              Registra entrada, pausas y salida desde el panel de fichaje. Es la acción principal del
              día.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/clock">
                <Button variant="primary" size="lg">
                  <Clock3 className="h-4 w-4" />
                  Ir a fichar
                </Button>
              </Link>
              <Link href="/history">
                <Button variant="secondary" size="lg">
                  Ver historial
                </Button>
              </Link>
            </div>
          </div>
          <div className="border-t border-[var(--border)] bg-[var(--accent-soft)] p-6 sm:p-8 lg:border-l lg:border-t-0">
            <div className="text-xs text-[var(--text-muted)]">Horas netas</div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-[var(--text-secondary)]">Semana</div>
                <div className="mt-1 text-2xl font-semibold text-[var(--text)]">{weekHours}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-secondary)]">Mes</div>
                <div className="mt-1 text-2xl font-semibold text-[var(--text)]">{monthHours}</div>
              </div>
            </div>
            <div className="mt-6 text-xs text-[var(--text-muted)]">
              Turnos del mes: <span className="text-[var(--text)]">{monthShifts}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Turnos en curso"
          value={String(openShifts)}
          sub={
            openOver10h > 0
              ? `${openOver10h} con más de 10h abiertas`
              : isAdmin
                ? "En tu empresa"
                : "Tus fichajes abiertos"
          }
          tone={openOver10h > 0 ? "warning" : openShifts > 0 ? "info" : "default"}
        />
        <StatCard
          title={isAdmin ? "Vacaciones pendientes" : "Mis vacaciones pendientes"}
          value={String(isAdmin ? pendingVacCompany : myPendingVac)}
          sub={isAdmin ? "Equipo por revisar" : "Sin aprobar"}
          tone={(isAdmin ? pendingVacCompany : myPendingVac) > 0 ? "warning" : "success"}
        />
        <StatCard title="Horas semana" value={weekHours} sub="Netas cerradas" />
        <StatCard title="Horas mes" value={monthHours} sub="Netas cerradas" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <MiniCalendar
          days={calDays}
          monthDate={calMonth}
          onPrevMonth={() => setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          onNextMonth={() => setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
        />

        <div className="space-y-4">
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[var(--accent-hover)]" />
              <div className="text-sm font-semibold">Actividad</div>
            </div>
            <div className="space-y-3">
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <div className="text-sm font-medium">
                  {openShifts > 0 ? "Hay turnos en curso" : "Sin turnos abiertos"}
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {openOver10h > 0
                    ? "Hay fichajes abiertos desde hace muchas horas."
                    : openShifts > 0
                      ? "Revisa si deben cerrarse."
                      : "Todo correcto por ahora."}
                </p>
                {isAdmin ? (
                  <Link
                    href="/admin/shifts"
                    className="mt-3 inline-block text-sm text-[var(--accent-hover)] hover:underline"
                  >
                    Abrir fichajes →
                  </Link>
                ) : null}
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <div className="text-sm font-medium">
                  {(isAdmin ? pendingVacCompany : myPendingVac) > 0
                    ? "Vacaciones pendientes"
                    : "Vacaciones al día"}
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {(isAdmin ? pendingVacCompany : myPendingVac) > 0
                    ? isAdmin
                      ? "Hay solicitudes del equipo por revisar."
                      : "Tienes solicitudes sin aprobar."
                    : "No hay solicitudes pendientes."}
                </p>
                <Link
                  href={isAdmin ? "/admin/vacations" : "/vacations"}
                  className="mt-3 inline-block text-sm text-[var(--accent-hover)] hover:underline"
                >
                  {isAdmin ? "Vacaciones del equipo →" : "Mis vacaciones →"}
                </Link>
              </div>
            </div>
          </Card>

          {isAdmin ? (
            <Card>
              <div className="text-sm font-semibold">Alta de trabajadores</div>
              {company?.join_code ? (
                <>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Código: <span className="font-semibold text-[var(--text)]">{company.join_code}</span>
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        if (!inviteLink) return;
                        navigator.clipboard.writeText(inviteLink);
                        setToast("Enlace de invitación copiado");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar link
                    </Button>
                    <Link href="/admin/users">
                      <Button variant="secondary" size="sm">
                        Empleados
                      </Button>
                    </Link>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-[var(--danger)]">No se puede leer el código de alta.</p>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
