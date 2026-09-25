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

/** Avoid double PKCE exchange under React Strict Mode remounts. */
let recoveryExchangeStarted = false;

export default function UpdatePasswordPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const prepareRecoverySession = async () => {
      setChecking(true);
      setError(null);
      setReady(false);

      try {
        // Await client init first — @supabase/ssr may already consume ?code= via
        // detectSessionInUrl. Do not treat a later exchange failure as fatal if a
        // session already exists (common with Strict Mode remounts).
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code && !initialSession && !recoveryExchangeStarted) {
          recoveryExchangeStarted = true;
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (cancelled) return;

          if (exchangeError) {
            const {
              data: { session: afterExchange },
            } = await supabase.auth.getSession();

            if (!afterExchange) {
              setError("El enlace de recuperación no es válido o ha expirado.");
              setChecking(false);
              return;
            }
          }

          url.searchParams.delete("code");
          window.history.replaceState({}, "", `${url.pathname}${url.search}`);
        } else if (!initialSession) {
          // Legacy / implicit email links: #access_token&refresh_token&type=recovery
          const hash = window.location.hash.startsWith("#")
            ? window.location.hash.slice(1)
            : "";
          const params = new URLSearchParams(hash);
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          const type = params.get("type");

          if (type === "recovery" && access_token && refresh_token) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });

            if (cancelled) return;

            if (sessionError) {
              const {
                data: { session: afterSet },
              } = await supabase.auth.getSession();

              if (!afterSet) {
                setError("El enlace de recuperación no es válido o ha expirado.");
                setChecking(false);
                return;
              }
            }

            window.location.hash = "";
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (session) {
          setError(null);
          setReady(true);
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

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("El enlace de recuperación no es válido o ha expirado.");
        setReady(false);
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

              {!msg && ready ? (
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
