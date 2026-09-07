"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, LogOut, Printer, RotateCw, ServerCrash, ShieldAlert, Store, Wifi, WifiOff, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEmployeeSessionStore } from "@/store/useEmployeeSessionStore";
import { useOfflineQueueStore } from "@/store/useOfflineQueueStore";
import { useWaiterOrderStore } from "@/store/useWaiterOrderStore";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { useConnectionStatusStore } from "@/store/useConnectionStatusStore";
import { TAKEOUT_MODE } from "@/lib/app-mode";

export default function PerfilPage() {
  const router = useRouter();
  const [switchRequested, setSwitchRequested] = useState(false);
  const online = useOnlineStatus();
  const serverReachability = useConnectionStatusStore((state) => state.serverReachability);
  const lastServerContactAt = useConnectionStatusStore((state) => state.lastServerContactAt);
  const employee = useEmployeeSessionStore((state) => state.employee);
  const logout = useEmployeeSessionStore((state) => state.logout);
  const ticketItems = useWaiterOrderStore((state) => state.ticketItems);
  const lastLocalChangeAt = useWaiterOrderStore((state) => state.lastLocalChangeAt);
  const activeTableName = useWaiterOrderStore((state) => state.activeTableName);
  const clearTicket = useWaiterOrderStore((state) => state.clearTicket);
  const pendingCount = useOfflineQueueStore((state) =>
    state.queue.filter((t) => !t.synced && !t.failedPermanently).length,
  );
  const failedTransactions = useOfflineQueueStore((state) =>
    state.queue.filter((t) => t.failedPermanently),
  );
  const retryFailed = useOfflineQueueStore((state) => state.retryFailed);
  const unsyncedCount = pendingCount + failedTransactions.length;

  const total = ticketItems.reduce((sum, item) => sum + item.total, 0);
  const itemCount = ticketItems.reduce((sum, item) => sum + item.quantity, 0);
  const employeeName =
    employee?.name ||
    (typeof window !== "undefined" ? localStorage.getItem("currentEmployeeName") : null) ||
    TAKEOUT_MODE ? "Empleado activo" : "Mesero activo";

  const changeWaiter = () => {
    logout();
    router.replace("/pin");
  };

  const requestWaiterChange = () => {
    if (itemCount === 0 && unsyncedCount === 0) {
      changeWaiter();
      return;
    }
    setSwitchRequested(true);
  };

  return (
    <section className="min-h-screen bg-[var(--bg)] px-5 py-5 pb-28">
      <header className="mb-6">
        <p className="text-sm font-bold uppercase tracking-wide text-[var(--brand)]">Empleado</p>
        <h1 className="text-3xl font-black text-[var(--text-primary)]">{employeeName}</h1>
      </header>

      {/* ── ESTADO ─────────────────────────────────────────── */}
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">Estado</p>
      <article className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-black uppercase text-[var(--text-muted)]">Por enviar</p>
            <p className="mt-1 text-3xl font-black text-[var(--text-primary)]">{pendingCount}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase text-[var(--text-muted)]">Comanda en curso</p>
            <p className="mt-1 text-3xl font-black text-[var(--brand)]">${total.toFixed(2)}</p>
            <p className="text-sm font-bold text-[var(--text-secondary)]">
              {ticketItems.length} partidas · {itemCount} unidades
            </p>
            {itemCount > 0 && (
              <p className="mt-1 text-xs font-bold text-[var(--brand)]">
                {activeTableName || "Para llevar"}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3 text-sm font-bold text-[var(--text-secondary)]">
          {!online ? (
            <WifiOff size={16} className="text-[var(--warning)]" />
          ) : serverReachability === "unavailable" ? (
            <ServerCrash size={16} className="text-[var(--danger)]" />
          ) : (
            <Wifi size={16} className="text-[var(--success)]" />
          )}
          <span
            className={
              !online
                ? "text-[var(--warning)]"
                : serverReachability === "unavailable"
                  ? "text-[var(--danger)]"
                  : "text-[var(--text-secondary)]"
            }
          >
            {!online
              ? "Sin internet"
              : serverReachability === "unavailable"
                ? "Servidor no disponible"
                : "Servidor activo"}
          </span>
          <span className="text-[var(--text-muted)]">·</span>
          {lastServerContactAt
            ? `Último contacto ${new Date(lastServerContactAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
            : lastLocalChangeAt
              ? `Actividad local ${new Date(lastLocalChangeAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
              : "Sin contacto todavía"}
        </div>
      </article>

      {failedTransactions.length > 0 && (
        <article className="mt-3 rounded-lg border border-[var(--danger)] bg-[var(--surface-1)] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 shrink-0 text-[var(--danger)]" size={28} />
            <div className="min-w-0">
              <p className="text-lg font-black text-[var(--danger)]">
                {failedTransactions.length} comanda{failedTransactions.length === 1 ? "" : "s"} sin enviar
              </p>
              <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                El servidor rechazó {failedTransactions.length === 1 ? "esta comanda" : "estas comandas"} varias veces. Revisa sesión, sucursal y turno, luego reintenta.
              </p>
              {failedTransactions[0]?.lastError && (
                <p className="mt-2 break-words text-sm font-bold text-[var(--text-muted)]">
                  Último error: {failedTransactions[0].lastError}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={retryFailed}
            className="mt-4 flex min-h-[64px] w-full items-center justify-center gap-3 rounded-lg border border-[var(--danger)] bg-[var(--surface-3)] px-5 text-lg font-black text-[var(--danger)] active:scale-95 transition-all duration-150"
          >
            <RotateCw size={22} />
            Reintentar comandas fallidas
          </button>
        </article>
      )}

      {/* ── CONFIGURACIÓN ──────────────────────────────────── */}
      <p className="mb-2 mt-6 text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">Configuración</p>
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)]">
        <Link
          href="/setup"
          className="flex min-h-[72px] items-center gap-4 border-b border-[var(--border)] px-5 active:scale-[0.98] transition-all duration-150"
        >
          <Store size={24} className="shrink-0 text-[var(--brand)]" />
          <div className="min-w-0">
            <p className="text-lg font-black text-[var(--text-primary)]">Restaurante y sucursal</p>
            <p className="text-sm font-bold text-[var(--text-muted)]">Vincula esta tablet a una sucursal</p>
          </div>
        </Link>
        <Link
          href="/impresion"
          className="flex min-h-[72px] items-center gap-4 px-5 active:scale-[0.98] transition-all duration-150"
        >
          <Printer size={24} className="shrink-0 text-[var(--brand)]" />
          <div className="min-w-0">
            <p className="text-lg font-black text-[var(--text-primary)]">Impresión</p>
            <p className="text-sm font-bold text-[var(--text-muted)]">Misma configuración del TPV · sincronización automática</p>
          </div>
        </Link>
      </div>

      {/* ── SESIÓN ─────────────────────────────────────────── */}
      <p className="mb-2 mt-6 text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">Sesión</p>
      <button
        type="button"
        onClick={requestWaiterChange}
        className="flex min-h-[72px] w-full items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-5 text-xl font-black text-[var(--text-primary)] active:scale-95 transition-all duration-150"
      >
        <LogOut size={24} />
        {TAKEOUT_MODE ? "Cambiar empleado" : "Cambiar mesero"}
      </button>

      {switchRequested && (
        <div
          className="fixed inset-0 z-[80] flex items-end bg-black/65 p-4 sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-waiter-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") setSwitchRequested(false);
          }}
        >
          <section className="w-full max-w-md rounded-card border border-[var(--border-strong)] bg-[var(--surface-1)] p-5 shadow-strong">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <ShieldAlert className="shrink-0 text-[var(--warning)]" size={28} />
                <div>
                  <h2 id="change-waiter-title" className="text-xl font-black text-[var(--text-primary)]">
                    Trabajo pendiente
                  </h2>
                  <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                    Evitamos que la comanda de {employeeName} quede ligada al siguiente mesero.
                  </p>
                </div>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setSwitchRequested(false)}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-3)]"
                aria-label="Cerrar aviso"
              >
                <X size={21} />
              </button>
            </div>

            {unsyncedCount > 0 ? (
              <div className="mt-4 rounded-lg border border-[var(--danger)] bg-[var(--surface-3)] p-4" role="alert">
                <p className="font-black text-[var(--danger)]">
                  {unsyncedCount} comanda{unsyncedCount === 1 ? "" : "s"} aún no llegaron al servidor
                </p>
                <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                  Conéctate y envíalas antes de cambiar de mesero. No se borrarán ni se reasignarán en silencio.
                </p>
                {failedTransactions.length > 0 && (
                  <button
                    type="button"
                    onClick={retryFailed}
                    className="mt-3 min-h-[52px] w-full rounded-lg border border-[var(--danger)] px-4 font-black text-[var(--danger)]"
                  >
                    Reintentar fallidas
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <p className="rounded-lg border border-[var(--warning)] bg-[var(--surface-3)] p-4 text-sm font-bold text-[var(--text-secondary)]">
                  Hay {ticketItems.length} partidas sin enviar para {activeTableName || "Para llevar"}.
                </p>
                <button
                  type="button"
                  onClick={() => setSwitchRequested(false)}
                  className="min-h-[56px] rounded-lg bg-[var(--brand)] px-4 font-black text-[var(--brand-fg)]"
                >
                  Continuar esta comanda
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearTicket();
                    changeWaiter();
                  }}
                  className="min-h-[56px] rounded-lg border border-[var(--danger)] px-4 font-black text-[var(--danger)]"
                >
                  Descartar comanda y cambiar
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
