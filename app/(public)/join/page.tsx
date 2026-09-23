"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { validatePassword, MIN_PASSWORD_LENGTH } from "@/lib/passwordPolicy";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

/** Join codes históricos: 6–8 chars. Aceptamos 4–12 alfanuméricos para no romper legacy. */
function isPlausibleJoinCode(code: string) {
  return /^[A-Za-z0-9]{4,12}$/.test(code);
}

function JoinContent() {
  const sp = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const { error: toastError, success } = useToast();

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

      if (!isPlausibleJoinCode(code)) {
        setErrorMsg("Código de invitación con formato no válido.");
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
  }, [code, supabase]);

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

      const passwordError = validatePassword(password);
      if (passwordError) {
        setErrorMsg(passwordError);
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
        const msg = userFacingError(signUpErr);
        setErrorMsg(msg);
        toastError(msg);
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInErr) {
        const info =
          "Cuenta creada correctamente. Si no entras automáticamente, inicia sesión manualmente.";
        setInfoMsg(info);
        success(info);
        return;
      }

      window.location.assign("/app");
    } catch (e: unknown) {
      const message = userFacingError(e);
      setErrorMsg(message);
      toastError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Fichagest</h1>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            Alta de trabajador · by Iberogest
          </p>
        </div>

        <Card>
          {checking ? (
            <p className="text-center text-sm text-[var(--text-secondary)]">
              Comprobando invitación…
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-secondary)]">
                Empresa: <span className="font-medium text-[var(--text)]">{companyName ?? "—"}</span>
                <br />
                Código: <span className="font-medium text-[var(--text)]">{code || "—"}</span>
              </div>

              {errorMsg ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
                  {errorMsg}
                </div>
              ) : null}

              {infoMsg ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--success)]/30 bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">
                  {infoMsg}
                </div>
              ) : null}

              {!checking && companyId ? (
                <>
                  <FormField label="Nombre" htmlFor="join-name">
                    <Input
                      id="join-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Tu nombre y apellidos"
                      disabled={loading}
                    />
                  </FormField>

                  <FormField label="DNI / NIE" htmlFor="join-dni">
                    <Input
                      id="join-dni"
                      value={dni}
                      onChange={(e) => setDni(e.target.value)}
                      placeholder="12345678X / X1234567L"
                      disabled={loading}
                    />
                  </FormField>

                  <FormField label="Email" htmlFor="join-email">
                    <Input
                      id="join-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="trabajador@empresa.com"
                      disabled={loading}
                      autoComplete="email"
                    />
                  </FormField>

                  <FormField label="Contraseña" htmlFor="join-password">
                    <Input
                      id="join-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                      disabled={loading}
                      autoComplete="new-password"
                    />
                  </FormField>

                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={handleSignup}
                    loading={loading}
                    disabled={checking}
                  >
                    Crear cuenta y entrar
                  </Button>
                </>
              ) : null}
            </div>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          Acceso para trabajadores invitados por su empresa
        </p>
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-secondary)]">
          Cargando…
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
