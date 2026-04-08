"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Shift = {
  id: string;
  user_id: string;
  company_id: string;
  started_at: string;
  ended_at: string | null;
};

type MeProfile = {
  role: string;
  company_id: string | null;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  role: string | null;
};

function msToHHMM(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function CompanyShiftsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    // 1) sesión
    const { data: sess } = await supabase.auth.getSession();
    const session = sess.session;
    if (!session) {
      router.push("/login?next=/company/shifts");
      return;
    }

    const uid = session.user.id;

    // 2) validar admin
    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("user_id", uid)
      .maybeSingle<MeProfile>();

    if (meErr) {
      setErrorMsg(meErr.message);
      setLoading(false);
      return;
    }

    if (!me || (me.role || "").toLowerCase() !== "admin") {
      router.push("/app");
      return;
    }

    if (!me.company_id) {
      setErrorMsg("Tu perfil admin no tiene company_id.");
      setLoading(false);
      return;
    }

    setCompanyId(me.company_id);

    // 3) cargar shifts de la empresa
    const { data: sRows, error: sErr } = await supabase
      .from("shifts")
      .select("id, user_id, company_id, started_at, ended_at")
      .eq("company_id", me.company_id)
      .order("started_at", { ascending: false })
      .limit(300);

    if (sErr) {
      setErrorMsg(sErr.message);
      setLoading(false);
      return;
    }

    const list = (sRows ?? []) as Shift[];
    setShifts(list);

    // 4) cargar nombres de usuarios (profiles)
    const userIds = Array.from(new Set(list.map((x) => x.user_id)));
    if (userIds.length > 0) {
      const { data: pRows, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, role")
        .in("user_id", userIds);

      if (pErr) {
        // si esto fallara por RLS, ahora ya debería estar resuelto con la policy admin_select_company_profiles
        // pero igualmente lo mostramos bonito
        console.error(pErr);
      } else {
        const map: Record<string, string> = {};
        (pRows as ProfileRow[] | null)?.forEach((p) => {
          map[p.user_id] = p.full_name?.trim() || p.user_id.slice(0, 8);
        });
        setNameByUser(map);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const countInCourse = useMemo(() => shifts.filter((s) => !s.ended_at).length, [shifts]);

  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-xl shadow-md w-[980px]">
        <div className="flex justify-between items-start gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold">Turnos de la empresa</h1>
            <p className="text-gray-600 mt-1">
              Empresa: <b>{companyId ? "OK" : "—"}</b> · En curso: <b>{countInCourse}</b> ·
              Total mostrados: <b>{shifts.length}</b>
            </p>
          </div>

          <div className="flex gap-3">
            <a className="underline text-sm" href="/app">
              Panel
            </a>
            <button className="border px-3 py-2 rounded-md text-sm" onClick={load} disabled={loading}>
              {loading ? "Cargando..." : "Recargar"}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-md border text-red-700 bg-red-50">{errorMsg}</div>
        )}

        {loading ? (
          <p className="text-gray-600">Cargando...</p>
        ) : (
          <div className="space-y-2">
            {shifts.map((s) => {
              const start = new Date(s.started_at);
              const end = s.ended_at ? new Date(s.ended_at) : null;
              const dur = end ? msToHHMM(end.getTime() - start.getTime()) : "—";
              const who = nameByUser[s.user_id] || s.user_id.slice(0, 8);

              return (
                <div key={s.id} className="border rounded-md p-4 flex justify-between">
                  <div>
                    <div className="font-bold">{who}</div>
                    <div className="text-sm text-gray-700">
                      {start.toLocaleString()} → {end ? end.toLocaleString() : "EN CURSO"}
                    </div>
                    <div className="text-sm text-gray-600">Duración: {dur}</div>
                  </div>

                  <a className="underline text-sm" href={`/shift/${s.id}`}>
                    Ver detalle
                  </a>
                </div>
              );
            })}

            {shifts.length === 0 && <p className="text-gray-500">Aún no hay turnos.</p>}
          </div>
        )}
      </div>
    </main>
  );
}