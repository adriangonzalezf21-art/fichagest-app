"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    setLoading(true);
    setMsg(null);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://fichagest.iberogest.com/update-password",
    });

    if (error) {
      setError(error.message);
    } else {
      setMsg("Si el email existe, recibirás un enlace para restablecer tu contraseña.");
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[#0B0F17] flex items-center justify-center text-white p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.05] p-8">
        <h1 className="text-2xl font-bold mb-6">Recuperar contraseña</h1>

        {msg && <div className="mb-4 text-green-400">{msg}</div>}
        {error && <div className="mb-4 text-red-400">{error}</div>}

        <input
          type="email"
          placeholder="tuemail@empresa.com"
          className="w-full mb-4 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button
          onClick={handleReset}
          disabled={loading}
          className="w-full bg-white text-black py-3 rounded-xl"
        >
          {loading ? "Enviando..." : "Enviar enlace"}
        </button>
      </div>
    </main>
  );
}