export default function CompanyBlocked() {
  return (
    <main className="min-h-screen bg-[#0B0F17] flex items-center justify-center p-6 text-white">
      <div className="w-full max-w-2xl rounded-2xl border border-red-500/30 bg-red-500/10 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="text-sm text-red-200/80 mb-2">Fichagest · by Iberogest</div>
        <h1 className="text-3xl font-bold mb-3">Empresa bloqueada</h1>
        <p className="text-white/80">
          El acceso a esta cuenta está temporalmente bloqueado. Puede deberse a un
          impago o a una incidencia administrativa.
        </p>
        <p className="text-white/60 mt-4">
          Contacta con Iberogest para reactivar el servicio.
        </p>
      </div>
    </main>
  );
}