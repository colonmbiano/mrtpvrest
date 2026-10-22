// Fallback de carga de la raíz. También cubre rutas sin loading propio (como
// /[slug]), así que se mantiene genérico: nada específico del catálogo.
export default function Loading() {
  return (
    <main
      className="flex min-h-[100dvh] items-center justify-center px-6"
      style={{ background: '#f8f8f6', color: '#1a1a1a' }}
    >
      <div role="status" aria-live="polite" className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-6 w-6 animate-spin rounded-full border-4 border-gray-300 border-t-[#c2410c] motion-reduce:animate-none"
        />
        <span className="font-bold">Cargando…</span>
      </div>
    </main>
  );
}
