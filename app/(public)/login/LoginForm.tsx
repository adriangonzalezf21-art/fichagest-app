"use client";

import { useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock3, ShieldCheck, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSafeInternalPath } from "@/lib/safeRedirect";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";

const IBEROGEST_HOME = "https://iberogest.com";

function authErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? String((err as { message: unknown }).message)
        : "";

  const m = raw.toLowerCase();
  if (!raw) return "No se ha podido iniciar sesión. Inténtalo de nuevo.";
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Email o contraseña incorrectos.";
  }
  if (m.includes("email not confirmed")) {
    return "Debes confirmar tu email antes de entrar.";
  }
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  }
  if (m.includes("fetch") || m.includes("network") || m.includes("failed to fetch")) {
    return "No hay conexión con el servidor de autenticación. Revisa tu red.";
  }
  if (raw.length <= 140) return raw;
  console.error("[login]", raw);
  return "No se ha podido iniciar sesión. Inténtalo de nuevo.";
}

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const next = getSafeInternalPath(searchParams.get("next"), "/app");

  const signIn = async () => {
    setErrorMsg(null);

    const cleanedEmail = email.trim();
    if (!cleanedEmail || !password) {
      setErrorMsg("Introduce email y contraseña.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanedEmail,
        password,
      });

      if (error) {
        setErrorMsg(authErrorMessage(error));
        setLoading(false);
        return;
      }

      if (!data.session) {
        const { data: sessData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr || !sessData.session) {
          setErrorMsg(
            "La sesión no se ha establecido correctamente. Recarga e inténtalo de nuevo."
          );
          setLoading(false);
          return;
        }
      }

      window.location.assign(next);
    } catch (e: unknown) {
      setErrorMsg(authErrorMessage(e));
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col">
      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8">
        <a
          href={IBEROGEST_HOME}
          className="login-back inline-flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <ArrowLeft className="login-back-icon h-4 w-4 shrink-0" aria-hidden />
          Volver a Iberogest
        </a>
        <span className="hidden items-center gap-2 text-xs text-[var(--text-muted)] sm:inline-flex">
          <span className="login-live-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
          Producto de Iberogest
        </span>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-10 pt-2 sm:px-6">
        <div className="login-shell grid w-full max-w-5xl overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] lg:grid-cols-[1.05fr_0.95fr]">
          <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-[var(--border)] bg-[var(--bg-elevated)] p-10 lg:flex">
            <div className="login-orb login-orb-a" aria-hidden />
            <div className="login-orb login-orb-b" aria-hidden />

            <div className="relative">
              <div className="mb-8 flex items-center gap-3">
                <Image
                  src="/icon-192.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-[var(--radius-md)]"
                  priority
                />
                <div className="leading-tight">
                  <div className="text-base font-semibold tracking-tight text-[var(--text)]">
                    Ficha<span className="font-extrabold">gest</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">by Iberogest</div>
                </div>
              </div>

              <h1 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-[var(--text)]">
                Control horario claro para tu equipo
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--text-secondary)]">
                Ficha, gestiona vacaciones y planifica turnos desde una única plataforma
                profesional.
              </p>
            </div>

            <ul className="relative mt-10 space-y-4">
              <li className="login-feature flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-[var(--accent-hover)] transition hover:scale-105">
                  <Clock3 className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">Fichaje sencillo</div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                    Entrada, pausa y salida en segundos
                  </div>
                </div>
              </li>
              <li className="login-feature flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-[var(--accent-hover)] transition hover:scale-105">
                  <Building2 className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">Multiempresa</div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                    Pensado para asesorías y pymes
                  </div>
                </div>
              </li>
              <li className="login-feature flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-[var(--accent-hover)] transition hover:scale-105">
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">Cumplimiento laboral</div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                    Registro de jornada listo para exportación
                  </div>
                </div>
              </li>
            </ul>
          </aside>

          <section className="login-form-panel flex items-center justify-center p-6 sm:p-10">
            <div className="w-full max-w-sm">
              <div className="mb-8 lg:mb-10">
                <div className="mb-5 flex items-center gap-3 lg:hidden">
                  <Image
                    src="/icon-192.png"
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-[var(--radius-md)]"
                    priority
                  />
                  <div className="leading-tight">
                    <div className="text-sm font-semibold tracking-tight">
                      Ficha<span className="font-extrabold">gest</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">by Iberogest</div>
                  </div>
                </div>

                <h2 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
                  Iniciar sesión
                </h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Accede a tu panel de control horario
                </p>
              </div>

              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void signIn();
                }}
              >
                {errorMsg ? (
                  <div
                    role="alert"
                    className="rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2.5 text-sm text-[var(--danger)]"
                  >
                    {errorMsg}
                  </div>
                ) : null}

                <FormField label="Email" htmlFor="login-email">
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="tuemail@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoComplete="email"
                    required
                  />
                </FormField>

                <FormField label="Contraseña" htmlFor="login-password">
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="Tu contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                    required
                  />
                </FormField>

                <div className="flex justify-end">
                  <a
                    href="/forgot-password"
                    className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--accent-hover)] hover:underline"
                  >
                    ¿Has olvidado tu contraseña?
                  </a>
                </div>

                <Button type="submit" variant="accent" size="lg" className="w-full" loading={loading}>
                  Entrar a Fichagest
                </Button>
              </form>

              <div className="mt-8 border-t border-[var(--border)] pt-6 text-center">
                <p className="text-xs text-[var(--text-muted)]">
                  ¿Buscas asesoría fiscal, laboral o contable?
                </p>
                <a
                  href={IBEROGEST_HOME}
                  className="login-iberogest mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent-hover)] underline-offset-2 hover:underline"
                >
                  Ir a la web de Iberogest
                  <ArrowRight className="login-iberogest-icon h-3.5 w-3.5" aria-hidden />
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
