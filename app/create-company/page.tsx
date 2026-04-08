"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function CreateCompanyPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [companyCif, setCompanyCif] = useState(""); // ✅ NUEVO
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      if (!companyName.trim() || !fullName.trim() || !email.trim() || !password) {
        setErrorMsg("Todos los campos son obligatorios.");
        setLoading(false);
        return;
      }

      // ✅ CIF recomendado (puedes hacerlo obligatorio o no)
      // Si lo quieres obligatorio, descomenta:
      // if (!companyCif.trim()) { setErrorMsg("El CIF es obligatorio."); setLoading(false); return; }

      // 1️⃣ Crear usuario en Auth
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (signUpErr) {
        setErrorMsg(signUpErr.message);
        setLoading(false);
        return;
      }

      const user = signUpData.user;
      if (!user) {
        setErrorMsg("No se pudo crear el usuario.");
        setLoading(false);
        return;
      }

      // 2️⃣ Crear empresa
      const joinCode = generateJoinCode();

      const { data: companyData, error: companyErr } = await supabase
        .from("companies")
        .insert({
          name: companyName.trim(),
          cif: companyCif.trim() || null, // ✅ NUEVO
          join_code: joinCode,
        })
        .select("id")
        .single();

      if (companyErr) {
        setErrorMsg(companyErr.message);
        setLoading(false);
        return;
      }

      const companyId = companyData.id;

      // 3️⃣ Crear profile OWNER
      const { error: profileErr } = await supabase.from("profiles").insert({
        user_id: user.id,
        full_name: fullName.trim(),
        company_id: companyId,
        role: "admin",
        active: true,
        is_owner: true,
      });

      if (profileErr) {
        setErrorMsg(profileErr.message);
        setLoading(false);
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
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-xl shadow-md w-[520px]">
        <h1 className="text-3xl font-bold mb-6">Crear empresa</h1>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-md border text-red-700 bg-red-50">
            {errorMsg}
          </div>
        )}

        <label className="text-sm">Nombre de la empresa</label>
        <input
          className="w-full mb-4 p-3 border rounded-md"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Ej: Talleres López S.L."
        />

        <label className="text-sm">CIF (recomendado)</label>
        <input
          className="w-full mb-4 p-3 border rounded-md"
          value={companyCif}
          onChange={(e) => setCompanyCif(e.target.value)}
          placeholder="Ej: B12345678"
        />

        <label className="text-sm">Tu nombre</label>
        <input
          className="w-full mb-4 p-3 border rounded-md"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <label className="text-sm">Email</label>
        <input
          type="email"
          className="w-full mb-4 p-3 border rounded-md"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="text-sm">Contraseña</label>
        <input
          type="password"
          className="w-full mb-6 p-3 border rounded-md"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
        />

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full bg-black text-white py-3 px-4 rounded-md disabled:opacity-40"
        >
          {loading ? "Creando..." : "Crear empresa y entrar"}
        </button>
      </div>
    </main>
  );
}