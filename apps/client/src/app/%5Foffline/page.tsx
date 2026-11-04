import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';
import OfflineRetry from '@/components/OfflineRetry';

export const metadata: Metadata = { title: 'Sin conexión', robots: { index: false, follow: false } };

/**
 * Fallback offline servido por el Service Worker cuando la navegación
 * a una página no cacheada falla por falta de conexión.
 *
 * La carpeta es `%5Foffline` (el `_` escapado) porque una carpeta que empieza
 * con `_` es privada en el App Router y no genera ruta: así existe `/_offline`,
 * la URL que el Service Worker precachea (next.config.mjs → fallbacks.document;
 * ahí mismo `manifestTransforms` escapa el `%` de sus chunks).
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f7f9f8] p-6 text-center text-[#23362b]">
      <span className="grid size-14 place-items-center rounded-2xl bg-[#e6f4e8]">
        <WifiOff className="h-7 w-7 text-[#187445]" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-extrabold">Estás sin conexión</h1>
      <p className="max-w-xs text-sm leading-relaxed text-[#617567]">
        Las páginas que ya abriste siguen disponibles. Para pedir o ver el estado de tu pedido necesitas conexión.
      </p>
      <OfflineRetry />
    </main>
  );
}
