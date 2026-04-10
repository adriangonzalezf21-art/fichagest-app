"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleSession = async () => {
      const hash = window.location.hash.replace("#", "");
      const params = new URLSearchParams(hash);

      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (access_token && refresh_token) {
        await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
      }
    };

    handleSession();
  }, []);

  const handleUpdate = async () => {
    setLoading(true);
    setError(null);

    if (password.length < 6) {
      setError("Mínimo 6 caracteres");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      setMsg("Contraseña actualizada");
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[#0B0F17] flex items-center justify-center text-white p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.05] p-8">
        <h1 className="text-2xl font-bold mb-6">Nueva contraseña</h1>

        {msg && <div className="mb-4 text-green-400">{msg}</div>}
        {error && <div className="mb-4 text-red-400">{error}</div>}

        <input
          type="password"
          placeholder="Nueva contraseña"
          className="w-full mb-4 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleUpdate}
          disabled={loading}
          className="w-full bg-white text-black py-3 rounded-xl"
        >
          {loading ? "Guardando..." : "Actualizar contraseña"}
        </button>
      </div>
    </main>
  );
}