"use client";
import { useState } from "react";
import { CloudOff, RefreshCcw, CloudUpload, X, Clock, AlertTriangle, Trash2 } from "lucide-react";
import useOfflineStore, { type OfflineTransaction } from "@/store/useOfflineStore";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { syncOfflineQueue } from "@/lib/offline";

// Chip flotante top-right que aparece SOLO cuando hay algo que comunicar:
// - Offline → rojo, prioridad máxima.
// - Sincronizando → ámbar con spinner.
// - Pendientes en cola → cyan informativo.
// Cuando todo está OK no renderiza nada, así no roba foco.
//
// Click en el chip → drawer con la lista de transacciones pendientes y
// botón "Forzar sync" (útil al volver online cuando aún no disparó el
// siguiente tick del background sync de 5s).
//
// Las tx RECHAZADAS por el backend (4xx definitivo) se listan aparte con su
// motivo y un "Descartar": ya no se reintentan solas, así que sin esa salida
// se quedarían en el chip para siempre.
//
// Posicionado top-right para evitar chocar con el FAB de /pos/menu
// (bottom-right) y con el sticky CTA de /meseros/[id] (bottom).
export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const queue = useOfflineStore((s) => s.queue);
  const syncInProgress = useOfflineStore((s) => s.syncInProgress);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const unsynced = queue.filter((tx) => !tx.synced && !tx.failed);
  const failed = queue.filter((tx) => !tx.synced && tx.failed);
  const unsyncedCount = unsynced.length;
  const failedCount = failed.length;

  if (isOnline && !syncInProgress && unsyncedCount === 0 && failedCount === 0) {
    return null;
  }

  const base =
    "fixed top-3 right-3 z-[60] flex items-center gap-2 px-3.5 py-2 rounded-full border backdrop-blur-md shadow-lg text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-transform";

  const chip = !isOnline ? (
    <button
      type="button"
      onClick={() =>
        (unsyncedCount > 0 || failedCount > 0) && setDrawerOpen(true)
      }
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
      className={`${base} bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]`}
      aria-label="Sincronizando"
    >
      <RefreshCcw size={14} strokeWidth={2.5} className="animate-spin" />
      <span>Sincronizando</span>
      {unsyncedCount > 0 && (
        <span className="tabular-nums opacity-80">· {unsyncedCount}</span>
      )}
    </button>
  ) : failedCount > 0 && unsyncedCount === 0 ? (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      className={`${base} bg-[var(--danger-soft)] border-[var(--danger)] text-[var(--danger)]`}
      aria-label="Transacciones rechazadas"
    >
      <AlertTriangle size={14} strokeWidth={2.5} />
      <span>
        {failedCount} con error
      </span>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      className={`${base} bg-[var(--success-soft)] border-[var(--success)] text-[var(--success)]`}
      aria-label="Pendientes de sincronizar"
    >
      <CloudUpload size={14} strokeWidth={2.5} />
      <span>
        {unsyncedCount} pendiente{unsyncedCount === 1 ? "" : "s"}
      </span>
      {failedCount > 0 && (
        <span className="tabular-nums text-[var(--danger)]">
          · {failedCount} error
        </span>
      )}
    </button>
  );

  return (
    <>
      {chip}
      {drawerOpen && (
        <PendingDrawer
          unsynced={unsynced}
          failed={failed}
          isOnline={isOnline}
          syncInProgress={syncInProgress}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}

function PendingDrawer({
  unsynced,
  failed,
  isOnline,
  syncInProgress,
  onClose,
}: {
  unsynced: OfflineTransaction[];
  failed: OfflineTransaction[];
  isOnline: boolean;
  syncInProgress: boolean;
  onClose: () => void;
}) {
  const discardTransaction = useOfflineStore((s) => s.discardTransaction);
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
    shift: "Apertura de turno",
    "shift-close": "Cierre de turno",
    "shift-expense": "Gasto de caja",
    "shift-cashin": "Ingreso de caja",
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end md:items-start md:justify-end p-0 md:p-3"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-md max-h-[85vh] overflow-auto rounded-t-3xl md:rounded-3xl bg-[var(--surface-1)] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.6)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-black text-white">Cola offline</h2>
            <p className="text-[11px] text-white/40 mt-0.5">
              {unsynced.length} pendiente{unsynced.length === 1 ? "" : "s"}
              {failed.length > 0 && (
                <span className="text-[var(--danger)]">
                  {" "}
                  · {failed.length} con error
                </span>
              )}{" "}
              · {isOnline ? "Online" : "Sin conexión"}
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

        {unsynced.length === 0 && failed.length === 0 ? (
          <p className="text-sm text-white/40 text-center py-8">Sin pendientes.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5 mb-4">
            {unsynced.map((tx) => {
              const path = (tx.data as any)?.path || "";
              return (
                <li key={tx.id} className="py-3 flex items-start gap-3">
                  <Clock size={14} className="text-[var(--warning)] mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white">
                      {typeLabel[tx.type] || tx.type}
                      <span className="text-[11px] text-white/40 ml-2 font-normal">
                        {fmtAgo(tx.timestamp)}
                      </span>
                    </div>
                    {path && (
                      <div className="text-[11px] text-white/40 truncate font-mono">{path}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {failed.length > 0 && (
          <section className="mb-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--danger)] mb-1">
              Rechazadas por el servidor
            </h3>
            <p className="text-[11px] text-white/40 mb-2">
              Ya no se reintentan. Verifica el ticket antes de descartar.
            </p>
            <ul className="flex flex-col divide-y divide-white/5">
              {failed.map((tx) => {
                const path = (tx.data as any)?.path || "";
                return (
                  <li key={tx.id} className="py-3 flex items-start gap-3">
                    <AlertTriangle
                      size={14}
                      className="text-[var(--danger)] mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white">
                        {typeLabel[tx.type] || tx.type}
                        <span className="text-[11px] text-white/40 ml-2 font-normal">
                          {fmtAgo(tx.timestamp)}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--danger)] break-words">
                        {tx.failed?.status} · {tx.failed?.error}
                      </div>
                      {path && (
                        <div className="text-[11px] text-white/40 truncate font-mono">
                          {path}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => discardTransaction(tx.id)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/40 active:scale-95"
                      aria-label={`Descartar ${typeLabel[tx.type] || tx.type}`}
                    >
                      <Trash2 size={12} strokeWidth={2.5} />
                      Descartar
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-[12px] font-bold text-white/70 bg-white/5 border border-white/10 hover:bg-white/10"
          >
            Cerrar
          </button>
          <button
            disabled={!isOnline || syncInProgress || unsynced.length === 0}
            onClick={() => {
              void syncOfflineQueue();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-black text-[var(--brand-fg)] bg-[var(--brand)] active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
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
