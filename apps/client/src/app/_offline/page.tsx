import { WifiOff } from 'lucide-react';

export const metadata = { title: 'Sin conexión' };

/**
 * Fallback offline servido por el Service Worker cuando la navegación
 * a una página no cacheada falla por falta de conexión.
 */
export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center bg-black text-white">
      <WifiOff size={36} className="text-zinc-500" />
      <h1 className="text-xl font-bold">Estás sin conexión</h1>
      <p className="text-sm text-zinc-400 max-w-xs">
        Te mostraremos lo último que viste cuando la conexión vuelva.
      </p>
    </main>
  );
}
