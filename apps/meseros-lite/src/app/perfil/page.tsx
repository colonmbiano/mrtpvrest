"use client";

import Link from "next/link";
import { AlertTriangle, LogOut, Printer, RotateCw, Store, Wifi, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEmployeeSessionStore } from "@/store/useEmployeeSessionStore";
import { useOfflineQueueStore } from "@/store/useOfflineQueueStore";
import { useWaiterOrderStore } from "@/store/useWaiterOrderStore";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

export default function PerfilPage() {
  const router = useRouter();
  const online = useOnlineStatus();
  const employee = useEmployeeSessionStore((state) => state.employee);
  const logout = useEmployeeSessionStore((state) => state.logout);
  const ticketItems = useWaiterOrderStore((state) => state.ticketItems);
  const lastLocalChangeAt = useWaiterOrderStore((state) => state.lastLocalChangeAt);
  const pendingCount = useOfflineQueueStore((state) =>
    state.queue.filter((t) => !t.synced && !t.failedPermanently).length,
  );
  const failedTransactions = useOfflineQueueStore((state) =>
    state.queue.filter((t) => t.failedPermanently),
  );
  const retryFailed = useOfflineQueueStore((state) => state.retryFailed);

  const total = ticketItems.reduce((sum, item) => sum + item.total, 0);
  const itemCount = ticketItems.reduce((sum, item) => sum + item.quantity, 0);
  const employeeName =
    employee?.name ||
    (typeof window !== "undefined" ? localStorage.getItem("currentEmployeeName") : null) ||
    "Mesero activo";

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
            <p className="text-sm font-bold text-[var(--text-secondary)]">{itemCount} producto{itemCount === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3 text-sm font-bold text-[var(--text-secondary)]">
          {online ? (
            <Wifi size={16} className="text-[var(--success)]" />
          ) : (
            <WifiOff size={16} className="text-[var(--warning)]" />
          )}
          <span className={online ? "text-[var(--text-secondary)]" : "text-[var(--warning)]"}>
            {online ? "En línea" : "Sin conexión"}
          </span>
          <span className="text-[var(--text-muted)]">·</span>
          {lastLocalChangeAt
            ? `Última actividad ${new Date(lastLocalChangeAt).toLocaleTimeString("es-MX")}`
            : "Sin ticket activo"}
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
        onClick={() => {
          logout();
          router.replace("/pin");
        }}
        className="flex min-h-[72px] w-full items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-5 text-xl font-black text-[var(--text-primary)] active:scale-95 transition-all duration-150"
      >
        <LogOut size={24} />
        Cambiar mesero
      </button>
    </section>
  );
}
