"use client";

/**
 * Alta pública de empresa.
 *
 * SEGURIDAD:
 * - is_owner SIEMPRE false desde este flujo (nunca platform owner).
 * - role fijo "admin" (nunca desde formulario / query / storage).
 * - company_id sale del INSERT de companies (nunca input libre).
 * - La protección real frente a abuso masivo depende de RLS + rate limiting server-side futuro.
 *   Este formulario solo añade validación UX / defensa en profundidad.
 */

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { validatePassword, MIN_PASSWORD_LENGTH } from "@/lib/passwordPolicy";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

const MAX_NAME = 120;
const MAX_CIF = 32;
const MAX_EMAIL = 254;

function generateJoinCode() {
  // Formato histórico (6 chars base36). No cambiar charset/longitud para no romper flujos existentes.
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function CreateCompanyPage() {
  const [companyName, setCompanyName] = useState("");
  const [companyCif, setCompanyCif] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { error: toastError } = useToast();

  const handleCreate = async () => {
    if (loading) return;
    setLoading(true);
    setErrorMsg(null);

    const supabase = createClient();

    try {
      const name = companyName.trim().slice(0, MAX_NAME);
      const cif = companyCif.trim().slice(0, MAX_CIF);
      const person = fullName.trim().slice(0, MAX_NAME);
      const mail = email.trim().toLowerCase().slice(0, MAX_EMAIL);

      if (!name || !person || !mail || !password) {
        setErrorMsg("Todos los campos son obligatorios.");
        return;
      }

      if (name.length < 2) {
        setErrorMsg("El nombre de la empresa es demasiado corto.");
        return;
      }

      if (!isValidEmail(mail)) {
        setErrorMsg("Introduce un email válido.");
        return;
      }

      const passwordError = validatePassword(password);
      if (passwordError) {
        setErrorMsg(passwordError);
        return;
      }

      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: mail,
        password,
      });

      if (signUpErr) {
        const msg = userFacingError(signUpErr);
        setErrorMsg(msg);
        toastError(msg);
        return;
      }

      const user = signUpData.user;
      if (!user) {
        setErrorMsg("No se pudo crear el usuario.");
        return;
      }

      const joinCode = generateJoinCode();

      const { data: companyData, error: companyErr } = await supabase
        .from("companies")
        .insert({
          name,
          cif: cif || null,
          join_code: joinCode,
        })
        .select("id")
        .single();

      if (companyErr) {
        const msg = userFacingError(companyErr);
        setErrorMsg(msg);
        toastError(msg);
        return;
      }

      const companyId = companyData.id;

      // role e is_owner controlados SOLO por código — nunca desde el cliente libremente.
      const { error: profileErr } = await supabase.from("profiles").insert({
        user_id: user.id,
        full_name: person,
        company_id: companyId,
        role: "admin",
        active: true,
        is_owner: false,
      });

      if (profileErr) {
        const msg = userFacingError(profileErr);
        setErrorMsg(msg);
        toastError(msg);
        return;
      }

      window.location.assign("/app");
    } catch (e: unknown) {
      const msg = userFacingError(e);
      setErrorMsg(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            Crear empresa
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Alta de administrador de empresa
          </p>
        </div>

        <Card>
          <div className="space-y-4">
            {errorMsg ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
                {errorMsg}
              </div>
            ) : null}

            <FormField label="Nombre de la empresa" htmlFor="cc-name">
              <Input
                id="cc-name"
                value={companyName}
                maxLength={MAX_NAME}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ej: Talleres López S.L."
                disabled={loading}
              />
            </FormField>

            <FormField label="CIF" htmlFor="cc-cif" hint="Recomendado">
              <Input
                id="cc-cif"
                value={companyCif}
                maxLength={MAX_CIF}
                onChange={(e) => setCompanyCif(e.target.value)}
                placeholder="Ej: B12345678"
                disabled={loading}
              />
            </FormField>

            <FormField label="Tu nombre" htmlFor="cc-fullname">
              <Input
                id="cc-fullname"
                value={fullName}
                maxLength={MAX_NAME}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
              />
            </FormField>

            <FormField label="Email" htmlFor="cc-email">
              <Input
                id="cc-email"
                type="email"
                value={email}
                maxLength={MAX_EMAIL}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
              />
            </FormField>

            <FormField label="Contraseña" htmlFor="cc-password">
              <Input
                id="cc-password"
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
              onClick={handleCreate}
              loading={loading}
            >
              Crear empresa y entrar
            </Button>

            <div className="text-center">
              <Link
                href="/login"
                className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text)] hover:underline"
              >
                ¿Ya tienes cuenta? Inicia sesión
              </Link>
            </div>
          </div>
        </Card>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          Este alta crea un administrador de empresa, no un propietario de plataforma.
        </p>
      </div>
    </main>
  );
}
