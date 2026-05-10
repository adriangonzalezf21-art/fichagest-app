"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { getMyCompanyAccess } from "@/lib/companyAccess";
import CompanyBlocked from "@/components/CompanyBlocked";

type Profile = {
  role: "admin" | "worker" | string;
  company_id: string | null;
  full_name?: string | null;
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

function LogoTimecore({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 select-none">
      <svg width={compact ? 30 : 34} height={compact ? 30 : 34} viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="42" fill="#134396" />
        <circle cx="60" cy="60" r="26" fill="#1E2A38" />
      </svg>

      {!compact && (
        <div className="leading-none">
          <div className="text-white text-[15px] tracking-wide">
            <span className="font-medium">Ficha</span>
            <span className="font-extrabold">gest</span>
          </div>
          <div className="text-white/60 text-[11px] mt-1">Control horario &amp; gestión</div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="p-5">
        <div className="text-white/70 text-xs">{title}</div>
        <div className="mt-2 text-white text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <div className="mt-2 text-white/60 text-xs">{sub}</div>}
      </div>
    </div>
  );
}

function ActionTile({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <a
      href={href}
      className="group rounded-2xl border border-white/10 bg-white/[0.05] p-5 hover:bg-white/[0.08] transition shadow-[0_10px_30px_rgba(0,0,0,0.22)]"
    >
      <div className="text-white font-semibold">{title}</div>
      <div className="text-white/60 text-sm mt-1">{desc}</div>
      <div className="text-[#7AA2FF] text-sm mt-3 group-hover:translate-x-0.5 transition">Abrir →</div>
    </a>
  );
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <div className="text-white/80 text-sm font-semibold">Calendario (mes)</div>
          <div className="text-white/55 text-xs mt-1">Turnos y vacaciones agregados por día</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onPrevMonth}
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white hover:bg-white/[0.10] transition"
            title="Mes anterior"
          >
            ←
          </button>

          <div className="text-white/60 text-xs rounded-full border border-white/10 px-3 py-1 bg-black/20">
            {monthDate.toLocaleString(undefined, { month: "long", year: "numeric" })}
          </div>

          <button
            onClick={onNextMonth}
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white hover:bg-white/[0.10] transition"
            title="Mes siguiente"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-[11px] text-white/60 mb-2">
        {["L", "M", "X", "J", "V", "S", "D"].map((x) => (
          <div key={x} className="text-center">
            {x}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {cells.map((c, idx) => {
          if (!c.date) {
            return <div key={idx} className="h-[62px] rounded-xl border border-white/5 bg-white/[0.02]" />;
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
              className={[
                "h-[62px] rounded-xl border border-white/10 bg-black/20 p-2",
                isToday ? "ring-1 ring-[#7AA2FF]/60" : "",
              ].join(" ")}
              title={[
  `${key}`,

  shifts
    ? `Turnos (${shifts}):\n${
        (r?.shift_names || []).length > 0
          ? (r?.shift_names || []).join("\n")
          : "Sin nombres disponibles"
      }`
    : "",

  vacs
    ? `Vacaciones (${vacs}):\n${
        (r?.vacation_names || []).length > 0
          ? (r?.vacation_names || []).join("\n")
          : "Sin nombres disponibles"
      }`
    : "",

  vacPend
    ? `Vacaciones pendientes: ${vacPend}`
    : "",
]
  .filter(Boolean)
  .join("\n\n")}
            >
              <div className="flex items-center justify-between">
                <div className="text-white/80 text-xs font-medium">{c.date.getDate()}</div>
                {isToday && <div className="text-[10px] text-[#7AA2FF]">Hoy</div>}
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {shifts > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.06] text-white/80">
                    ⏱ {shifts}
                  </span>
                )}
                {vacs > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.06] text-white/80">
                    🏖 {vacs}
                  </span>
                )}
                {vacPend > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.06] text-white/80">
                    ⏳ {vacPend}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex gap-3 flex-wrap text-xs text-white/55">
        <span className="px-2 py-1 rounded-full border border-white/10 bg-black/20">⏱ Turnos</span>
        <span className="px-2 py-1 rounded-full border border-white/10 bg-black/20">🏖 Vacaciones</span>
        <span className="px-2 py-1 rounded-full border border-white/10 bg-black/20">⏳ Pendientes</span>
      </div>
    </div>
  );
}

export default function AppHome() {
  const router = useRouter();

  const BG = "#111827";
  const PANEL = "bg-white/[0.06]";
  const BORDER = "border-white/10";

  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  const [calDays, setCalDays] = useState<CalendarDayRow[]>([]);
  const [calMonth, setCalMonth] = useState<Date>(new Date());

  const [pendingFixCompany, setPendingFixCompany] = useState<number | null>(null);
  const [pendingFixMine, setPendingFixMine] = useState<number | null>(null);

  const isAdmin = (profile?.role || "").toLowerCase() === "admin";

  const inviteLink = useMemo(() => {
    if (!isAdmin) return "";
    if (!company?.join_code) return "";
    if (typeof window === "undefined") return "";
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
        .select("role, company_id, full_name")
        .eq("user_id", session.user.id)
        .maybeSingle<Profile>();

      if (profErr) throw new Error(profErr.message);
      if (!prof) throw new Error("No existe tu perfil en profiles.");

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

      const { data: m, error: mErr } = await supabase.rpc("get_dashboard_metrics");
      if (mErr) {
        console.warn("get_dashboard_metrics:", mErr.message);
        setMetrics(null);
      } else {
        setMetrics(m as DashboardMetrics);
      }

      try {
        const mineQ = supabase
          .from("vacation_calendar")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING")
          .eq("user_id", session.user.id);

        const companyQ = supabase
          .from("vacation_calendar")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING");

        const [mineRes, companyRes] = await Promise.all([mineQ, companyQ]);

        if (!mineRes.error) setPendingFixMine(mineRes.count ?? 0);
        if (!companyRes.error) setPendingFixCompany(companyRes.count ?? 0);

        if (mineRes.error) console.warn("pendingFixMine:", mineRes.error.message);
        if (companyRes.error) console.warn("pendingFixCompany:", companyRes.error.message);
      } catch (e: any) {
        console.warn("pendingFix:", e?.message || e);
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
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, calMonth]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const displayName = profile?.full_name?.trim() || (email ? email.split("@")[0] : "Usuario");

  const weekHours = metrics?.week_hours ?? "00:00";
  const monthHours = metrics?.month_hours ?? "00:00";
  const monthShifts = metrics?.month_shifts ?? 0;
  const openShifts = metrics?.open_shifts ?? 0;
  const openOver10h = metrics?.open_shifts_over_10h ?? 0;

  const pendingVacCompany = pendingFixCompany ?? metrics?.pending_vac_company ?? 0;
  const myPendingVac = pendingFixMine ?? metrics?.my_pending_vac ?? 0;

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: BG }}>
        <div className="mx-auto max-w-7xl px-5 py-10">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8">
            <p className="text-white/70">Cargando panel…</p>
          </div>
        </div>
      </div>
    );
  }

  if (blocked) {
    return <CompanyBlocked />;
  }

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <div className="sticky top-0 z-20 border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <LogoTimecore />
            <div className="hidden md:block">
              <div className="text-white font-semibold">Panel</div>
              <div className="text-white/60 text-xs">
                {company?.name ? company.name : "—"} · {isAdmin ? "Admin" : "Trabajador"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <div className="text-white text-sm font-medium">{displayName}</div>
              <div className="text-white/60 text-xs">{email}</div>
            </div>

            <button
              onClick={load}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
            >
              Recargar
            </button>

            <button
              onClick={logout}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-3">
          <div className={`rounded-2xl border ${BORDER} ${PANEL} p-4 shadow-[0_10px_30px_rgba(0,0,0,0.22)]`}>
            <div className="flex items-center justify-between">
              <div className="text-white/80 text-xs">Navegación</div>
              <LogoTimecore compact />
            </div>

            <nav className="mt-4 space-y-2">
              <a
                href="/clock"
                className="block rounded-xl px-4 py-3 text-sm text-white/90 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition"
              >
                Ir a fichar
              </a>
              <a
                href="/history"
                className="block rounded-xl px-4 py-3 text-sm text-white/80 hover:text-white border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition"
              >
                Mis fichajes
              </a>
              {company?.enable_shift_planning && (
              <a
                href="/my-schedule"
                className="block rounded-xl px-4 py-3 text-sm text-white/80 hover:text-white border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition"
              >
                Mis turnos
              </a>
            )}
              <a
                href="/vacations"
                className="block rounded-xl px-4 py-3 text-sm text-white/80 hover:text-white border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition"
              >
                Vacaciones
              </a>
              {isAdmin && (
                <>
                  <div className="pt-3 pb-1 text-white/60 text-xs px-1">Zona Admin</div>
                  <a
                    href="/admin/shifts"
                    className="block rounded-xl px-4 py-3 text-sm text-white/80 hover:text-white border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition"
                  >
                    Fichajes empresa
                  </a>
                  {company?.enable_shift_planning && (
                  <a
                    href="/admin/planned-shifts"
                    className="block rounded-xl px-4 py-3 text-sm text-white/80 hover:text-white border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition"
                  >
                    Planificación de turnos
                  </a>
                )}
                {company?.enable_shift_planning && (
                  <a
                    href="/admin/planned-vs-real"
                    className="block rounded-xl px-4 py-3 text-sm text-white/80 hover:text-white border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition"
                  >
                    Comparador de turnos
                  </a>
                )}
                  <a
                    href="/admin/users"
                    className="block rounded-xl px-4 py-3 text-sm text-white/80 hover:text-white border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition"
                  >
                    Usuarios
                  </a>
                  <a
                    href="/admin/vacations"
                    className="block rounded-xl px-4 py-3 text-sm text-white/80 hover:text-white border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition"
                  >
                    Vacaciones equipo
                  </a>
                </>
              )}
            </nav>

            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-white/70 text-xs">Empresa</div>
              <div className="text-white font-semibold mt-1">{company?.name || "—"}</div>
              <div className="text-white/60 text-xs mt-1">
                CIF: <span className="text-white/80">{company?.cif?.trim() || "—"}</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="lg:col-span-9 space-y-6">
          {errorMsg && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-100">{errorMsg}</div>
          )}

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <div className="text-white/60 text-xs">Bienvenido</div>
                <div className="text-white text-2xl font-semibold tracking-tight">{displayName}</div>
                <div className="text-white/60 text-sm mt-2">
                  Resumen del mes actual (métricas y calendario según permisos).
                </div>
              </div>

              {isAdmin && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 min-w-[280px]">
                  <div className="text-white/70 text-xs mb-2">Alta de trabajadores</div>
                  {company?.join_code ? (
                    <>
                      <div className="text-white/90 text-sm">
                        Código: <span className="font-semibold">{company.join_code}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          className="rounded-xl bg-white text-black px-4 py-2 text-sm font-medium hover:opacity-90 transition"
                          onClick={() => {
                            if (!inviteLink) return;
                            navigator.clipboard.writeText(inviteLink);
                            alert("Link copiado ✅");
                          }}
                        >
                          Copiar link
                        </button>
                        <a
                          className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
                          href="/admin/users"
                        >
                          Gestionar usuarios
                        </a>
                      </div>
                      <div className="text-white/50 text-xs mt-2 break-all">{inviteLink}</div>
                    </>
                  ) : (
                    <div className="text-red-200 text-sm">No se puede leer join_code.</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard title="Horas netas (semana)" value={weekHours} sub="Turnos cerrados" />
            <StatCard title="Horas netas (mes)" value={monthHours} sub="Turnos cerrados" />
            <StatCard
              title="Turnos en curso"
              value={String(openShifts)}
              sub={openOver10h > 0 ? `⚠️ ${openOver10h} lleva > 10h` : `Mes: ${monthShifts} turnos`}
            />
            <StatCard
              title={isAdmin ? "Vacaciones pendientes" : "Mis vacaciones pendientes"}
              value={String(isAdmin ? pendingVacCompany : myPendingVac)}
              sub={isAdmin ? "Equipo (por revisar)" : "Solicitudes sin aprobar"}
            />
          </div>

          <MiniCalendar
            days={calDays}
            monthDate={calMonth}
            onPrevMonth={() => setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            onNextMonth={() => setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          />

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-7 space-y-4">
              <div className="text-white/80 text-sm font-semibold">Acciones rápidas</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ActionTile title="Fichar ahora" desc="Inicia o finaliza tu jornada en segundos." href="/clock" />
                <ActionTile title="Ver historial" desc="Consulta tus turnos y exporta cuando lo necesites." href="/history" />
                <ActionTile title="Solicitar vacaciones" desc="Envía una solicitud y revisa su estado." href="/vacations" />

                {isAdmin ? (
                  <ActionTile title="Vacaciones del equipo" desc="Aprueba o rechaza solicitudes." href="/admin/vacations" />
                ) : (
                  <ActionTile title="Mi resumen" desc="Revisa tu progreso del mes." href="/history" />
                )}
              </div>
            </div>

            <div className="xl:col-span-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white/80 text-sm font-semibold">Actividad</div>
                    <div className="text-white/55 text-xs mt-1">Señales rápidas para saber si todo va bien</div>
                  </div>
                  <div className="text-white/60 text-xs rounded-full border border-white/10 px-3 py-1 bg-black/20">
                    Mes actual
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-white/80 text-sm font-medium">
                      {openShifts > 0 ? "Hay turnos en curso" : "No hay turnos en curso"}
                    </div>
                    <div className="text-white/55 text-xs mt-1">
                      {openShifts > 0
                        ? openOver10h > 0
                          ? "⚠️ Hay fichajes abiertos desde hace muchas horas. Revisa Turnos."
                          : "Revisa si hay fichajes abiertos que deban cerrarse."
                        : "Todo correcto, no hay fichajes abiertos."}
                    </div>
                    {isAdmin && (
                      <div className="mt-3">
                        <a href="/admin/shifts" className="text-[#7AA2FF] text-sm hover:underline">
                          Abrir turnos empresa →
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-white/80 text-sm font-medium">
                      {(isAdmin ? pendingVacCompany : myPendingVac) > 0 ? "Vacaciones pendientes" : "Vacaciones al día"}
                    </div>
                    <div className="text-white/55 text-xs mt-1">
                      {(isAdmin ? pendingVacCompany : myPendingVac) > 0
                        ? isAdmin
                          ? "Tienes solicitudes del equipo por revisar."
                          : "Tienes solicitudes pendientes de aprobación."
                        : "No hay solicitudes pendientes ahora mismo."}
                    </div>
                    <div className="mt-3">
                      <a
                        href={isAdmin ? "/admin/vacations" : "/vacations"}
                        className="text-[#7AA2FF] text-sm hover:underline"
                      >
                        {isAdmin ? "Ir a vacaciones del equipo →" : "Ir a mis vacaciones →"}
                      </a>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-white/80 text-sm font-medium">Exportación</div>
                    <div className="text-white/55 text-xs mt-1">PDF inspección y Excel disponibles en Turnos.</div>
                    <div className="mt-3">
                      <a href={isAdmin ? "/admin/shifts" : "/history"} className="text-[#7AA2FF] text-sm hover:underline">
                        {isAdmin ? "Abrir turnos empresa →" : "Abrir mi historial →"}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-white/40 text-xs">Fichagest · Panel corporativo · Diseño premium</div>
        </main>
      </div>
    </div>
  );
}