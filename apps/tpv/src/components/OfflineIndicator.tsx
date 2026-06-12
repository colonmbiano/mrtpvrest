"use client";
import { useState } from "react";
import {
  CloudOff,
  RefreshCcw,
  CloudUpload,
  X,
  Clock,
  AlertTriangle,
} from "lucide-react";
import useOfflineStore, {
  type OfflineTransaction,
  statusOf,
} from "@/store/useOfflineStore";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { syncOfflineQueue } from "@/lib/offline";

// Chip flotante top-right que aparece SOLO cuando hay algo que comunicar:
// - Fallidas (revisar) → rojo persistente, prioridad máxima. Una sync de cobro
//   que el backend rechazó NUNCA se traga en silencio: el cajero lo ve aquí.
// - Offline → rojo pulsante.
// - Sincronizando → ámbar con spinner.
// - Pendientes en cola → cyan informativo.
// Cuando todo está OK no renderiza nada, así no roba foco.
//
// Click en el chip → drawer con la lista de transacciones (fallidas arriba con
// botón de reintento, pendientes abajo) y "Forzar sync".
//
// Posicionado top-right para evitar chocar con el FAB de /pos/menu
// (bottom-right) y con el sticky CTA de /meseros/[id] (bottom).
export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const queue = useOfflineStore((s) => s.queue);
  const syncInProgress = useOfflineStore((s) => s.syncInProgress);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const unsynced = queue.filter((tx) => !tx.synced);
  const failed = unsynced.filter((tx) => statusOf(tx) === "failed");
  const pending = unsynced.filter((tx) => statusOf(tx) === "pending");
  const unsyncedCount = unsynced.length;
  const failedCount = failed.length;
  // Un cobro fallido (pago, o create-paid de orden nueva) es lo más grave.
  const hasFailedMoney = failed.some(
    (tx) =>
      tx.type === "payment" ||
      (tx.type === "order" &&
        ((tx.data as any)?.body?.status === "DELIVERED" ||
          (tx.data as any)?.body?.paymentMethod)),
  );

  if (isOnline && !syncInProgress && unsyncedCount === 0) return null;

  const base =
    "fixed top-3 right-3 z-[60] flex items-center gap-2 px-3.5 py-2 rounded-full border backdrop-blur-md shadow-lg text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-transform";

  // Prioridad del chip: fallidas (humano) > offline > sincronizando > pendientes.
  const chip =
    failedCount > 0 ? (
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className={`${base} bg-red-500/20 border-red-500/60 text-red-300`}
        aria-label="Sincronización fallida — revisar"
      >
        <AlertTriangle size={14} strokeWidth={2.5} />
        <span>{hasFailedMoney ? "Cobro sin confirmar" : "Sin sincronizar"}</span>
        <span className="tabular-nums text-red-200">· {failedCount}</span>
      </button>
    ) : !isOnline ? (
      <button
        type="button"
        onClick={() => unsyncedCount > 0 && setDrawerOpen(true)}
        className={`${base} bg-red-500/15 border-red-500/40 text-red-400 animate-pulse`}
        aria-label="Estado offline"
      >
        <CloudOff size={14} strokeWidth={2.5} />
        <span>Sin conexión</span>
        {unsyncedCount > 0 && (
          <span className="tabular-nums text-red-300/80">· {unsyncedCount}</span>
        )}
      </button>
    ) : syncInProgress ? (
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className={`${base} bg-[#ffb84d]/15 border-[#ffb84d]/40 text-[#ffb84d]`}
        aria-label="Sincronizando"
      >
        <RefreshCcw size={14} strokeWidth={2.5} className="animate-spin" />
        <span>Sincronizando</span>
        {pending.length > 0 && (
          <span className="tabular-nums opacity-80">· {pending.length}</span>
        )}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className={`${base} bg-[#88D66C]/15 border-[#88D66C]/40 text-[#88D66C]`}
        aria-label="Pendientes de sincronizar"
      >
        <CloudUpload size={14} strokeWidth={2.5} />
        <span>
          {pending.length} pendiente{pending.length === 1 ? "" : "s"}
        </span>
      </button>
    );

  return (
    <>
      {chip}
      {drawerOpen && (
        <PendingDrawer
          failed={failed}
          pending={pending}
          isOnline={isOnline}
          syncInProgress={syncInProgress}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}

function PendingDrawer({
  failed,
  pending,
  isOnline,
  syncInProgress,
  onClose,
}: {
  failed: OfflineTransaction[];
  pending: OfflineTransaction[];
  isOnline: boolean;
  syncInProgress: boolean;
  onClose: () => void;
}) {
  const retryTransaction = useOfflineStore((s) => s.retryTransaction);
  // Snapshot al montar el drawer — Date.now() durante render es impuro
  // (react-compiler). Si el usuario deja el drawer abierto mucho rato los
  // tiempos se quedarán congelados, lo cual está bien para un panel
  // efímero que se cierra en segundos.
  const [openedAt] = useState(() => Date.now());
  const fmtAgo = (ts: number) => {
    const diff = openedAt - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "hace unos segundos";
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    return `hace ${h}h`;
  };

  const typeLabel: Record<string, string> = {
    order: "Orden",
    payment: "Pago",
    adjustment: "Ajuste",
    override: "Override",
  };

  const retryOne = (id: string) => {
    retryTransaction(id);
    void syncOfflineQueue();
  };
  const retryAll = () => {
    failed.forEach((tx) => retryTransaction(tx.id));
    void syncOfflineQueue();
  };

  const total = failed.length + pending.length;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end md:items-start md:justify-end p-0 md:p-3"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-md max-h-[85vh] overflow-auto rounded-t-3xl md:rounded-3xl bg-[#0e0e11] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.6)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-black text-white">Cola offline</h2>
            <p className="text-[11px] text-white/40 mt-0.5">
              {total} pendiente{total === 1 ? "" : "s"} ·{" "}
              {isOnline ? "Online" : "Sin conexión"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/5 active:scale-95"
            aria-label="Cerrar"
          >
            <X size={16} className="text-white/60" />
          </button>
        </header>

        {/* FALLIDAS — banner rojo + reintento. No se traga ningún cobro. */}
        {failed.length > 0 && (
          <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={16} className="text-red-400 shrink-0" />
              <h3 className="text-sm font-black text-red-300">
                Sin confirmar en el servidor
              </h3>
            </div>
            <p className="text-[11px] text-red-200/70 leading-relaxed mb-3">
              Estas operaciones no se registraron tras varios intentos. Revisa la
              conexión y reintenta; si era un cobro, concílialo en caja.
            </p>
            <ul className="flex flex-col divide-y divide-red-500/15 mb-3">
              {failed.map((tx) => {
                const path = (tx.data as any)?.path || "";
                return (
                  <li key={tx.id} className="py-2.5 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white">
                        {typeLabel[tx.type] || tx.type}
                        <span className="text-[11px] text-white/40 ml-2 font-normal">
                          {fmtAgo(tx.timestamp)}
                        </span>
                      </div>
                      {tx.lastError && (
                        <div className="text-[11px] text-red-300/80 truncate">
                          {tx.lastError}
                        </div>
                      )}
                      {path && (
                        <div className="text-[10px] text-white/30 truncate font-mono">
                          {path}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => retryOne(tx.id)}
                      disabled={!isOnline}
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider text-red-200 bg-red-500/15 border border-red-500/40 active:scale-95 disabled:opacity-40"
                    >
                      <RefreshCcw size={11} strokeWidth={3} />
                      Reintentar
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              onClick={retryAll}
              disabled={!isOnline || syncInProgress}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-[12px] font-black text-white bg-red-500/80 active:scale-95 transition-all disabled:opacity-40"
            >
              <RefreshCcw size={12} strokeWidth={3} />
              Reintentar todo
            </button>
          </div>
        )}

        {/* PENDIENTES — en cola, se reintentan solas. */}
        {pending.length === 0 ? (
          failed.length === 0 && (
            <p className="text-sm text-white/40 text-center py-8">
              Sin pendientes.
            </p>
          )
        ) : (
          <ul className="flex flex-col divide-y divide-white/5 mb-4">
            {pending.map((tx) => {
              const path = (tx.data as any)?.path || "";
              return (
                <li key={tx.id} className="py-3 flex items-start gap-3">
                  <Clock size={14} className="text-amber-300 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white">
                      {typeLabel[tx.type] || tx.type}
                      <span className="text-[11px] text-white/40 ml-2 font-normal">
                        {fmtAgo(tx.timestamp)}
                      </span>
                    </div>
                    {path && (
                      <div className="text-[11px] text-white/40 truncate font-mono">
                        {path}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-[12px] font-bold text-white/70 bg-white/5 border border-white/10 hover:bg-white/10"
          >
            Cerrar
          </button>
          <button
            disabled={!isOnline || syncInProgress || pending.length === 0}
            onClick={() => {
              void syncOfflineQueue();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-black text-[#0a0a0c] bg-amber-400 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
          >
            {syncInProgress ? (
              <RefreshCcw size={12} strokeWidth={3} className="animate-spin" />
            ) : (
              <CloudUpload size={12} strokeWidth={3} />
            )}
            Forzar sync
          </button>
        </div>
      </div>
    </div>
  );
}
