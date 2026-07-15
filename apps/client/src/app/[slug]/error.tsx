'use client';
// Boundary de error del storefront: un fallo transitorio (red / 5xx al cargar la
// tienda) muestra esto con un botón de reintento, en vez de degradar a un 404
// permanente. reset() re-renderiza el segmento.
export default function StoreError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main
      className="flex min-h-[100dvh] items-center justify-center px-6"
      style={{ background: '#f8f8f6', color: '#1a1a1a' }}
    >
      <div className="w-full max-w-sm text-center">
        <div className="mb-4 text-6xl">📶</div>
        <h1 className="mb-2 text-2xl font-black">No pudimos cargar la tienda</h1>
        <p className="mb-6 font-medium text-gray-500">
          Hubo un problema de conexión. Inténtalo de nuevo en un momento.
        </p>
        <button
          onClick={reset}
          className="w-full max-w-xs rounded-2xl py-4 font-black text-white active:scale-95"
          style={{ background: '#ff5c35' }}
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
