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
import { createClient } from "@/lib/supabase/client";
import { validatePassword, MIN_PASSWORD_LENGTH } from "@/lib/passwordPolicy";

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
        setErrorMsg(signUpErr.message);
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
        setErrorMsg(companyErr.message);
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
        setErrorMsg(profileErr.message);
        return;
      }

      window.location.assign("/app");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-xl shadow-md w-[520px]">
        <h1 className="text-3xl font-bold mb-2">Crear empresa</h1>
        <p className="text-sm text-gray-500 mb-6">
          Alta de administrador de empresa (no platform owner).
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-md border text-red-700 bg-red-50">{errorMsg}</div>
        )}

        <label className="text-sm">Nombre de la empresa</label>
        <input
          className="w-full mb-4 p-3 border rounded-md"
          value={companyName}
          maxLength={MAX_NAME}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Ej: Talleres López S.L."
          disabled={loading}
        />

        <label className="text-sm">CIF (recomendado)</label>
        <input
          className="w-full mb-4 p-3 border rounded-md"
          value={companyCif}
          maxLength={MAX_CIF}
          onChange={(e) => setCompanyCif(e.target.value)}
          placeholder="Ej: B12345678"
          disabled={loading}
        />

        <label className="text-sm">Tu nombre</label>
        <input
          className="w-full mb-4 p-3 border rounded-md"
          value={fullName}
          maxLength={MAX_NAME}
          onChange={(e) => setFullName(e.target.value)}
          disabled={loading}
        />

        <label className="text-sm">Email</label>
        <input
          type="email"
          className="w-full mb-4 p-3 border rounded-md"
          value={email}
          maxLength={MAX_EMAIL}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          autoComplete="email"
        />

        <label className="text-sm">Contraseña</label>
        <input
          type="password"
          className="w-full mb-6 p-3 border rounded-md"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
          disabled={loading}
          autoComplete="new-password"
        />

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full bg-black text-white py-3 px-4 rounded-md disabled:opacity-40"
        >
          {loading ? "Creando..." : "Crear empresa y entrar"}
        </button>

        <p className="text-xs text-gray-400 mt-4">
          Nota: el abuso de altas públicas requiere rate limiting y RLS en servidor; este formulario no
          sustituye esas capas.
        </p>
      </div>
    </main>
  );
}
