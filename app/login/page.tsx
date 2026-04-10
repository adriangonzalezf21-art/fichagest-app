"use client";
export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useSearchParams } from "next/navigation";
import { getMyCompanyAccess } from "@/lib/companyAccess";

function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/app";

  const signIn = async () => {
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        alert(error.message);
        return;
      }

      const access = await getMyCompanyAccess();

      if (!access.session) {
        alert("No se ha podido iniciar sesión correctamente.");
        return;
      }

      if (access.blocked) {
        window.location.href = "/app";
        return;
      }

      window.location.href = next;
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0B0F17] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.10),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_28%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.03),transparent_20%,transparent_80%,rgba(255,255,255,0.02))]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:grid-cols-2">
          <div className="hidden lg:flex flex-col justify-between border-r border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-10">
            <div>
              <div className="mb-6 inline-flex items-center gap-3">
                <div className="h-4 w-4 rounded-full bg-[#3B82F6]" />
                <span className="text-sm font-medium tracking-wide text-white/80">
                  Fichagest
                </span>
              </div>

              <h1 className="max-w-md text-4xl font-bold leading-tight">
                Control horario simple, profesional y listo para empresas
              </h1>

              <p className="mt-5 max-w-md text-sm leading-6 text-white/60">
                Control de jornada desde una sola plataforma.
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm font-semibold text-white">Acceso centralizado</div>
                <div className="mt-1 text-xs text-white/55">
                  Controla tu empresa desde un solo panel
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm font-semibold text-white">Preparado para crecer</div>
                <div className="mt-1 text-xs text-white/55">
                  Multiempresa, gestión de usuarios y control operativo.
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center p-6 sm:p-10">
            <div className="w-full max-w-md">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
                  <div className="h-5 w-5 rounded-full bg-[#3B82F6]" />
                </div>

                <h2 className="text-3xl font-bold tracking-tight">Fichagest</h2>
                <p className="mt-2 text-sm text-white/50">
                  Control horario · by Iberogest
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 shadow-[0_10px_40px_rgba(0,0,0,0.25)]">
                <label className="mb-2 block text-sm text-white/70">Email</label>
                <input
                  type="email"
                  placeholder="tuemail@empresa.com"
                  className="w-full mb-4 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-white/35 focus:outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />

                <label className="mb-2 block text-sm text-white/70">Contraseña</label>
                <input
                  type="password"
                  placeholder="Tu contraseña"
                  className="w-full mb-6 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-white/35 focus:outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />

                <button
                  type="button"
                  onClick={signIn}
                  disabled={loading}
                  className="w-full rounded-xl bg-white py-3 text-black font-semibold transition hover:opacity-90 disabled:opacity-50 shadow-[0_10px_30px_rgba(255,255,255,0.08)]"
                >
                  {loading ? "Accediendo..." : "Iniciar sesión"}
                </button>

                <div className="mt-4 text-center">
                  <a
                    href="/forgot-password"
                    className="text-sm text-white/60 hover:text-white underline"
                  >
                    ¿Has olvidado tu contraseña?
                  </a>
                </div>
              </div>

              <div className="mt-6 text-center text-xs text-white/35">
                Sistema de registro de jornada laboral
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center text-white">
          Cargando...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}