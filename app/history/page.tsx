"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { getMyCompanyAccess } from "@/lib/companyAccess";
import CompanyBlocked from "@/components/CompanyBlocked";

type Shift = {
  id: string;
  started_at: string;
  ended_at: string | null;
};

function msToHHMM(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function HistoryPage() {
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  const load = async () => {
    setLoading(true);

    try {
      const access = await getMyCompanyAccess();

      if (!access.session) {
        router.push("/login?next=/history");
        return;
      }

      if (access.blocked) {
        setBlocked(true);
        setShifts([]);
        return;
      }

      setBlocked(false);

      const { data, error } = await supabase
        .from("shifts")
        .select("id, started_at, ended_at")
        .order("started_at", { ascending: false })
        .limit(50);

      if (error) {
        alert(error.message);
        return;
      }

      setShifts((data ?? []) as Shift[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const access = await getMyCompanyAccess();

      if (!access.session) {
        router.push("/login?next=/history");
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

  if (blocked) {
    return <CompanyBlocked />;
  }

  return (
    <main className="min-h-screen bg-[#111827] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
          <div className="flex justify-between items-start gap-4 flex-wrap mb-6">
            <div>
              <div className="text-white/60 text-xs">Fichagest · by Iberogest</div>
              <h1 className="text-3xl font-bold text-white mt-1">Mi historial</h1>
              <p className="text-white/60 mt-1">Historial de turnos (últimos 50)</p>
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
                href="/clock"
              >
                Ir a fichar
              </a>

              <a
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
                href="/app"
              >
                Panel
              </a>
            </div>
          </div>

          {loading ? (
            <p className="text-white/70">Cargando...</p>
          ) : shifts.length === 0 ? (
            <p className="text-white/50">Aún no hay turnos.</p>
          ) : (
            <div className="space-y-3">
              {shifts.map((s) => {
                const start = new Date(s.started_at);
                const end = s.ended_at ? new Date(s.ended_at) : null;
                const dur = end ? msToHHMM(end.getTime() - start.getTime()) : "—";

                return (
                  <div
                    key={s.id}
                    className="border border-white/10 rounded-2xl p-4 bg-black/20 flex justify-between items-center gap-4"
                  >
                    <div>
                      <div className="font-semibold text-white">
                        {start.toLocaleString()} → {end ? end.toLocaleString() : "EN CURSO"}
                      </div>
                      <div className="text-sm text-white/60 mt-1">
                        Duración: <span className="text-white">{dur}</span>
                      </div>
                    </div>

                    <a
                      className="text-sm text-[#7AA2FF] hover:underline whitespace-nowrap"
                      href={`/shift/${s.id}`}
                    >
                      Ver detalle →
                    </a>
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