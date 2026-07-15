// Se muestra cuando page.tsx llama a notFound() (slug inexistente o tienda sin
// web store). Marca genérica y en español, mucho mejor que el 404 de Next.
export default function StoreNotFound() {
  return (
    <main
      className="flex min-h-[100dvh] items-center justify-center px-6"
      style={{ background: '#f8f8f6', color: '#1a1a1a' }}
    >
      <div className="w-full max-w-sm text-center">
        <div className="mb-4 text-6xl">🍽️</div>
        <h1 className="mb-2 text-2xl font-black">Tienda no encontrada</h1>
        <p className="font-medium text-gray-500">
          Esta tienda no existe o su tienda en línea no está disponible. Revisa el
          enlace con el negocio.
        </p>
      </div>
    </main>
  );
}
