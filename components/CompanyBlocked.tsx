export default function CompanyBlocked() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--text)]">
      <div className="w-full max-w-xl rounded-[var(--radius-xl)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-8 shadow-[var(--shadow-lg)]">
        <div className="mb-2 text-sm text-[var(--danger)]">Fichagest · by Iberogest</div>
        <h1 className="mb-3 text-3xl font-bold">Empresa bloqueada</h1>
        <p className="text-[var(--text-secondary)]">
          El acceso a esta cuenta está temporalmente bloqueado. Puede deberse a un impago o a una
          incidencia administrativa.
        </p>
        <p className="mt-4 text-[var(--text-muted)]">
          Contacta con Iberogest para reactivar el servicio.
        </p>
      </div>
    </main>
  );
}
