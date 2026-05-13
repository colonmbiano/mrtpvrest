"use client";
import React from "react";
import { CloudOff, RefreshCcw, CloudUpload } from "lucide-react";
import useOfflineStore from "@/store/useOfflineStore";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

// Chip flotante top-right que aparece SOLO cuando hay algo que comunicar:
// - Offline → rojo, prioridad máxima.
// - Sincronizando → ámbar con spinner.
// - Pendientes en cola → cyan informativo.
// Cuando todo está OK no renderiza nada, así no roba foco.
//
// Posicionado top-right para evitar chocar con el FAB de /pos/menu
// (bottom-right) y con el sticky CTA de /meseros/[id] (bottom).
export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const queue = useOfflineStore((s) => s.queue);
  const syncInProgress = useOfflineStore((s) => s.syncInProgress);
  const unsynced = queue.filter((tx) => !tx.synced).length;

  if (isOnline && !syncInProgress && unsynced === 0) return null;

  const base =
    "fixed top-3 right-3 z-[60] flex items-center gap-2 px-3.5 py-2 rounded-full border backdrop-blur-md shadow-lg text-[10px] font-black uppercase tracking-[0.2em]";

  if (!isOnline) {
    return (
      <div
        className={`${base} bg-red-500/15 border-red-500/40 text-red-400 animate-pulse`}
        role="status"
        aria-live="polite"
      >
        <CloudOff size={14} strokeWidth={2.5} />
        <span>Sin conexión</span>
        {unsynced > 0 && (
          <span className="tabular-nums text-red-300/80">· {unsynced}</span>
        )}
      </div>
    );
  }

  if (syncInProgress) {
    return (
      <div
        className={`${base} bg-[#ffb84d]/15 border-[#ffb84d]/40 text-[#ffb84d]`}
        role="status"
        aria-live="polite"
      >
        <RefreshCcw size={14} strokeWidth={2.5} className="animate-spin" />
        <span>Sincronizando</span>
        {unsynced > 0 && (
          <span className="tabular-nums opacity-80">· {unsynced}</span>
        )}
      </div>
    );
  }

  // Pendientes sin estar sincronizando ahora (ej. acabamos de volver
  // online y el siguiente tick aún no corre).
  return (
    <div
      className={`${base} bg-[#88D66C]/15 border-[#88D66C]/40 text-[#88D66C]`}
      role="status"
    >
      <CloudUpload size={14} strokeWidth={2.5} />
      <span>
        {unsynced} pendiente{unsynced === 1 ? "" : "s"}
      </span>
    </div>
  );
}
