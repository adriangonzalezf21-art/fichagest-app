"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const prepareRecoverySession = async () => {
      setChecking(true);
      setError(null);

      try {
        const url = new URL(window.location.href);

        // Caso 1: flujo con ?code=...
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setError("El enlace de recuperación no es válido o ha expirado.");
            setChecking(false);
            return;
          }

          setChecking(false);
          return;
        }

        // Caso 2: flujo con #access_token y #refresh_token
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : "";

        const params = new URLSearchParams(hash);
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        const type = params.get("type");

        if (type === "recovery" && access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (error) {
            setError("El enlace de recuperación no es válido o ha expirado.");
            setChecking(false);
            return;
          }

          setChecking(false);
          return;
        }

        // Caso 3: ya hay sesión válida
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          setChecking(false);
          return;
        }

        setError("No se ha podido validar el enlace de recuperación.");
        setChecking(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Error inesperado.");
        setChecking(false);
      }
    };

    prepareRecoverySession();
  }, []);

  const handleUpdate = async () => {
    setLoading(true);
    setError(null);
    setMsg(null);

    try {
      if (!password || !password2) {
        setError("Completa ambos campos.");
        return;
      }

      if (password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres.");
        return;
      }

      if (password !== password2) {
        setError("Las contraseñas no coinciden.");
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setMsg("Contraseña actualizada correctamente. Redirigiendo al login...");

      setTimeout(async () => {
        await supabase.auth.signOut();
        router.push("/login");
      }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0B0F17] flex items-center justify-center text-white p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.05] p-8">
        <h1 className="text-2xl font-bold mb-6">Nueva contraseña</h1>

        {checking ? (
          <p className="text-white/70">Validando enlace...</p>
        ) : (
          <>
            {msg && <div className="mb-4 text-green-400">{msg}</div>}
            {error && <div className="mb-4 text-red-400">{error}</div>}

            {!msg && (
              <>
                <input
                  type="password"
                  placeholder="Nueva contraseña"
                  className="w-full mb-4 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <input
                  type="password"
                  placeholder="Repite la contraseña"
                  className="w-full mb-4 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                />

                <button
                  onClick={handleUpdate}
                  disabled={loading}
                  className="w-full bg-white text-black py-3 rounded-xl"
                >
                  {loading ? "Guardando..." : "Actualizar contraseña"}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}