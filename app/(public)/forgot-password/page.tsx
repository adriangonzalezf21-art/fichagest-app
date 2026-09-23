"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { error: toastError, success } = useToast();

  const handleReset = async () => {
    setLoading(true);
    setMsg(null);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://fichagest.iberogest.com/update-password",
    });

    if (error) {
      const message = userFacingError(error);
      setError(message);
      toastError(message);
    } else {
      const ok = "Si el email existe, recibirás un enlace para restablecer tu contraseña.";
      setMsg(ok);
      success(ok);
    }

    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            Recuperar contraseña
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Te enviaremos un enlace para restablecer el acceso
          </p>
        </div>

        <Card>
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

            <FormField label="Email" htmlFor="forgot-email">
              <Input
                id="forgot-email"
                type="email"
                placeholder="tuemail@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
              />
            </FormField>

            <Button
              variant="primary"
              className="w-full"
              onClick={handleReset}
              loading={loading}
              disabled={!email.trim()}
            >
              Enviar enlace
            </Button>

            <div className="text-center">
              <Link
                href="/login"
                className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text)] hover:underline"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
