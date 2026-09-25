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
    let cancelled = false;

    const prepareRecoverySession = async () => {
      setChecking(true);
      setError(null);

      try {
        // @supabase/ssr createBrowserClient enables detectSessionInUrl by default.
        // It consumes ?code= (PKCE) during client init — do NOT call
        // exchangeCodeForSession again (that caused a false "invalid/expired" error
        // while the first exchange had already established a valid session).
        //
        // getSession() awaits client initialization, including URL detection.
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (session) {
          setError(null);
          setChecking(false);
          return;
        }

        // Stronger check after init (validates JWT with Auth when possible).
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled) return;

        if (user) {
          setError(null);
          setChecking(false);
          return;
        }

        setError("El enlace de recuperación no es válido o ha expirado.");
        setChecking(false);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error inesperado.");
        setChecking(false);
      }
    };

    prepareRecoverySession();
    return () => {
      cancelled = true;
    };
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
