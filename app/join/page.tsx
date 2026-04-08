"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function JoinPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const code = useMemo(() => (sp.get("code") || "").trim(), [sp]);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [dni, setDni] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      setChecking(true);
      setErrorMsg(null);
      setInfoMsg(null);

      if (!code) {
        setErrorMsg("Falta el código de invitación. Revisa el enlace.");
        setChecking(false);
        return;
      }

      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("join_code", code)
        .limit(1)
        .maybeSingle();

      if (error) {
        setErrorMsg(error.message);
        setChecking(false);
        return;
      }

      if (!data) {
        setErrorMsg("Código inválido o empresa no encontrada.");
        setChecking(false);
        return;
      }

      setCompanyId(data.id);
      setCompanyName(data.name);
      setChecking(false);
    };

    check();
  }, [code]);

  const handleSignup = async () => {
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      if (!code) {
        setErrorMsg("Falta el código de invitación.");
        return;
      }

      if (!companyId) {
        setErrorMsg("No hay empresa asociada a este enlace.");
        return;
      }

      if (!fullName.trim()) {
        setErrorMsg("Introduce tu nombre.");
        return;
      }

      if (!dni.trim()) {
        setErrorMsg("Introduce tu DNI/NIE.");
        return;
      }

      if (!email.trim() || !password) {
        setErrorMsg("Email y contraseña son obligatorios.");
        return;
      }

      if (password.length < 6) {
        setErrorMsg("La contraseña debe tener al menos 6 caracteres.");
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanFullName = fullName.trim();
      const cleanDni = dni.trim().toUpperCase();

      const { error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            join_code: code,
            full_name: cleanFullName,
            dni: cleanDni,
          },
        },
      });

      if (signUpErr) {
        setErrorMsg(signUpErr.message);
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInErr) {
        setInfoMsg(
          "Cuenta creada correctamente. Si no entras automáticamente, inicia sesión manualmente."
        );
        return;
      }

      router.push("/app");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0B0F17] flex items-center justify-center p-6 text-white">
      <div className="w-[560px] rounded-2xl border border-white/10 bg-white/[0.05] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Fichagest</h1>
          <p className="text-sm text-white/50 mt-1">Alta de trabajador · by Iberogest</p>
        </div>

        {checking ? (
          <p className="text-white/60 text-center">Comprobando invitación...</p>
        ) : (
          <>
            <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-white/70 text-sm">
                Empresa: <b className="text-white">{companyName ?? "—"}</b>
                <br />
                Código: <b className="text-white">{code || "—"}</b>
              </p>
            </div>

            {errorMsg && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-100">
                {errorMsg}
              </div>
            )}

            {infoMsg && (
              <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-green-100">
                {infoMsg}
              </div>
            )}

            {!errorMsg && (
              <>
                <label className="text-sm text-white/70">Nombre</label>
                <input
                  className="w-full mb-4 mt-1 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre y apellidos"
                />

                <label className="text-sm text-white/70">DNI / NIE</label>
                <input
                  className="w-full mb-4 mt-1 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  placeholder="12345678X / X1234567L"
                />

                <label className="text-sm text-white/70">Email</label>
                <input
                  type="email"
                  className="w-full mb-4 mt-1 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trabajador@empresa.com"
                />

                <label className="text-sm text-white/70">Contraseña</label>
                <input
                  type="password"
                  className="w-full mb-6 mt-1 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />

                <button
                  onClick={handleSignup}
                  disabled={loading || checking}
                  className="w-full bg-white text-black py-3 px-4 rounded-xl font-medium disabled:opacity-40 hover:opacity-90 transition"
                >
                  {loading ? "Creando cuenta..." : "Crear cuenta y entrar"}
                </button>
              </>
            )}
          </>
        )}

        <div className="text-center text-xs text-white/40 mt-6">
          Acceso para trabajadores invitados por su empresa
        </div>
      </div>
    </main>
  );
}