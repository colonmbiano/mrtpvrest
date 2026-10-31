'use client';
// Boundary de error de la raíz. El catálogo ya muestra los fallos de API por
// sección; esto solo cubre errores inesperados al renderizar la portada.
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main
      className="flex min-h-[100dvh] items-center justify-center px-6"
      style={{ background: '#f8f8f6', color: '#1a1a1a' }}
    >
      <div role="alert" className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-2xl font-black">No pudimos cargar el catálogo</h1>
        <p className="mb-6 font-medium text-gray-600">
          Ocurrió un problema inesperado. Inténtalo de nuevo en un momento.
        </p>
        <button
          type="button"
          onClick={reset}
          className="w-full max-w-xs rounded-2xl py-4 font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a3412] active:scale-95"
          style={{ background: '#c2410c' }}
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
