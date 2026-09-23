"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { validatePassword, MIN_PASSWORD_LENGTH } from "@/lib/passwordPolicy";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

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

      const passwordError = validatePassword(password);
      if (passwordError) {
        setError(passwordError);
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
        const message = userFacingError(error);
        setError(message);
        toastError(message);
        return;
      }

      const ok = "Contraseña actualizada correctamente. Redirigiendo al login…";
      setMsg(ok);
      success(ok);

      setTimeout(async () => {
        await supabase.auth.signOut();
        router.push("/login");
      }, 1500);
    } catch (e: unknown) {
      const message = userFacingError(e);
      setError(message);
      toastError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            Nueva contraseña
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Elige una contraseña segura para tu cuenta
          </p>
        </div>

        <Card>
          {checking ? (
            <p className="text-sm text-[var(--text-secondary)]">Validando enlace…</p>
          ) : (
            <div className="space-y-4">
              {msg ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--success)]/30 bg-[var(--success-soft)] p-3 text-sm text-[var(--success)]">
                  {msg}
                </div>
              ) : null}
              {error ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
                  {error}
                </div>
              ) : null}

              {!msg ? (
                <>
                  <FormField label="Nueva contraseña" htmlFor="new-password">
                    <Input
                      id="new-password"
                      type="password"
                      placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      autoComplete="new-password"
                    />
                  </FormField>

                  <FormField label="Repite la contraseña" htmlFor="new-password-2">
                    <Input
                      id="new-password-2"
                      type="password"
                      placeholder="Repite la contraseña"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      disabled={loading}
                      autoComplete="new-password"
                    />
                  </FormField>

                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={handleUpdate}
                    loading={loading}
                  >
                    Actualizar contraseña
                  </Button>
                </>
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
