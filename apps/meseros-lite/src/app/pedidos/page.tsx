"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, ChefHat, ClipboardList, RotateCw, WifiOff } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { useOfflineQueueStore } from "@/store/useOfflineQueueStore";
import { useWaiterOrderStore } from "@/store/useWaiterOrderStore";

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function timeLabel(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  return minutes === 1 ? "hace 1 min" : `hace ${minutes} min`;
}

export default function PedidosPage() {
  const router = useRouter();
  const assignedTables = useWaiterOrderStore((state) => state.assignedTables);
  const setActiveTable = useWaiterOrderStore((state) => state.setActiveTable);
  const ticketItems = useWaiterOrderStore((state) => state.ticketItems);
  const activeTableName = useWaiterOrderStore((state) => state.activeTableName);
  const previousItemCount = useWaiterOrderStore((state) => state.previousItemCount);
  const queue = useOfflineQueueStore((state) => state.queue);
  const retryFailed = useOfflineQueueStore((state) => state.retryFailed);

  const activeOrders = assignedTables
    .filter((table) => table.activeOrderId || table.status === "open")
    .sort((a, b) => (b.activeOrderTotal || 0) - (a.activeOrderTotal || 0));
  const queued = queue.filter((item) => !item.synced && !item.failedPermanently);
  const failed = queue.filter((item) => item.failedPermanently);
  const draftCount = ticketItems.reduce((sum, item) => sum + item.quantity, 0);
  const draftTotal = ticketItems.reduce((sum, item) => sum + item.total, 0);

  return (
    <section className="min-h-screen bg-[var(--bg)] px-4 py-5 pb-28 text-[var(--text-primary)]">
      <header className="mb-5">
        <p className="text-sm font-black uppercase tracking-wide text-[var(--text-secondary)]">
          Cocina y rondas
        </p>
        <h1 className="font-display text-[30px] font-black leading-tight">Pedidos</h1>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <article className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="text-xs font-black uppercase text-[var(--text-muted)]">Abiertas</p>
          <p className="mt-1 text-2xl font-black">{activeOrders.length}</p>
        </article>
        <article className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="text-xs font-black uppercase text-[var(--text-muted)]">En cola</p>
          <p className="mt-1 text-2xl font-black text-[var(--warning)]">{queued.length}</p>
        </article>
        <article className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="text-xs font-black uppercase text-[var(--text-muted)]">Fallidas</p>
          <p className="mt-1 text-2xl font-black text-[var(--danger)]">{failed.length}</p>
        </article>
      </div>

      {draftCount > 0 && (
        <article className="mb-4 rounded-card border border-[var(--warning)] bg-[var(--surface-2)] p-4 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <StatusBadge status="open" label="Pendiente" />
              <h2 className="mt-3 text-xl font-black">
                {activeTableName || "Para llevar"} · ronda en captura
              </h2>
              <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                {draftCount} productos nuevos · {previousItemCount} ya enviados
              </p>
            </div>
            <p className="shrink-0 text-2xl font-black tnum">{money(draftTotal)}</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/menu")}
            className="mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-soft border border-[var(--brand)] bg-[var(--brand)] px-4 text-lg font-black text-[var(--brand-fg)] active:scale-95 transition-all duration-150"
          >
            <ClipboardList size={22} /> Revisar comanda
          </button>
        </article>
      )}

      {queued.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
            Sin WiFi · en cola local
          </h2>
          <div className="grid gap-2">
            {queued.slice(0, 6).map((item, index) => (
              <article
                key={item.id}
                className="rounded-card border border-[var(--warning)] bg-[var(--surface-1)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <StatusBadge status="offline" label={`Ronda ${index + 1}`} />
                    <p className="mt-2 text-base font-black">Pendiente por sincronizar</p>
                    <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                      {timeLabel(item.timestamp)}
                    </p>
                  </div>
                  <WifiOff className="text-[var(--warning)]" size={24} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {failed.length > 0 && (
        <article className="mb-5 rounded-card border border-[var(--danger)] bg-[var(--surface-1)] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 shrink-0 text-[var(--danger)]" size={26} />
            <div className="min-w-0">
              <h2 className="text-lg font-black text-[var(--danger)]">Rondas con error</h2>
              <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                Revisa sesion, sucursal y turno. Luego intenta enviarlas otra vez.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={retryFailed}
            className="mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-soft border border-[var(--danger)] bg-[var(--surface-3)] text-base font-black text-[var(--danger)] active:scale-95 transition-all duration-150"
          >
            <RotateCw size={20} /> Reintentar fallidas
          </button>
        </article>
      )}

      <section>
        <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
          Cuentas abiertas
        </h2>
        <div className="grid gap-2">
          {activeOrders.length === 0 ? (
            <article className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-5 text-center">
              <ChefHat className="mx-auto text-[var(--text-muted)]" size={34} />
              <p className="mt-3 text-lg font-black">Sin pedidos activos</p>
              <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                Abre una mesa o manda una ronda para verla aqui.
              </p>
            </article>
          ) : (
            activeOrders.map((table, index) => (
              <button
                key={table.id}
                type="button"
                onClick={() => {
                  setActiveTable(
                    table.id,
                    table.name,
                    table.activeOrderId
                      ? {
                          id: table.activeOrderId,
                          itemCount: table.activeOrderItemCount || 0,
                          total: table.activeOrderTotal || 0,
                        }
                      : null,
                  );
                  router.push("/cuenta");
                }}
                className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-4 text-left active:scale-[0.99] transition-all duration-150"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <StatusBadge status={index === 0 ? "kitchen" : "open"} label={index === 0 ? "En cocina" : "Abierta"} />
                    <p className="mt-3 truncate text-xl font-black">{table.name}</p>
                    <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                      {table.zone || "Sin zona"} · {table.activeOrderItemCount || 0} productos
                    </p>
                  </div>
                  <p className="shrink-0 text-xl font-black tnum">{money(table.activeOrderTotal || 0)}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
