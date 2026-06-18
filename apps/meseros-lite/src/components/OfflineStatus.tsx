"use client";

import { AlertTriangle, RotateCw, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { useOfflineQueueStore } from "@/store/useOfflineQueueStore";

// Indicador global del estado de la cola offline. Surfacéa lo que el mesero
// necesita ver de un vistazo sin entrar a Perfil: si hay conexión, si se están
// enviando comandas en este momento, cuántas quedan por enviar y cuántas
// fallaron de forma permanente. Se monta una sola vez (en BottomNavigation),
// así que vive en todas las pantallas operativas.
export default function OfflineStatus() {
  const online = useOnlineStatus();
  const pendingCount = useOfflineQueueStore(
    (state) => state.queue.filter((t) => !t.synced && !t.failedPermanently).length,
  );
  const failedCount = useOfflineQueueStore(
    (state) => state.queue.filter((t) => t.failedPermanently).length,
  );
  const syncing = useOfflineQueueStore((state) => state.syncInProgress);

  // Todo en orden (con conexión, cola vacía y sin fallidas): no mostrar nada.
  if (online && pendingCount === 0 && failedCount === 0) return null;

  return (
    <div className="pointer-events-none flex flex-wrap justify-end gap-2">
      {!online && (
        <span className="flex items-center gap-2 rounded-lg border border-[var(--warning)] bg-[var(--surface-1)] px-3 py-2 text-xs font-black uppercase text-[var(--warning)]">
          <WifiOff size={14} strokeWidth={2.6} />
          Sin conexión{pendingCount > 0 ? ` · ${pendingCount} en cola` : ""}
        </span>
      )}
      {online && pendingCount > 0 && (
        <span className="flex items-center gap-2 rounded-lg border border-[var(--brand)] bg-[var(--surface-1)] px-3 py-2 text-xs font-black uppercase text-[var(--brand)]">
          <RotateCw size={14} strokeWidth={2.6} className={syncing ? "animate-spin" : undefined} />
          {syncing ? `Enviando ${pendingCount}…` : `${pendingCount} por enviar`}
        </span>
      )}
      {failedCount > 0 && (
        <span className="flex items-center gap-2 rounded-lg border border-[var(--danger)] bg-[var(--surface-1)] px-3 py-2 text-xs font-black uppercase text-[var(--danger)]">
          <AlertTriangle size={14} strokeWidth={2.6} />
          {failedCount} fallida{failedCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
