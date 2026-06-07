"use client";

import Link from "next/link";
import { AlertTriangle, LogOut, Printer, RotateCw, Store, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEmployeeSessionStore } from "@/store/useEmployeeSessionStore";
import { useOfflineQueueStore } from "@/store/useOfflineQueueStore";
import { useWaiterOrderStore } from "@/store/useWaiterOrderStore";

export default function PerfilPage() {
  const router = useRouter();
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
    <section className="min-h-screen bg-[#0a0a0c] px-5 py-5 pb-28">
      <header className="mb-6">
        <p className="text-sm font-bold uppercase tracking-wide text-[#ffb84d]">Empleado</p>
        <h1 className="text-3xl font-black text-neutral-200">{employeeName}</h1>
      </header>

      {/* ── ESTADO ─────────────────────────────────────────── */}
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-neutral-500">Estado</p>
      <article className="rounded-lg border border-neutral-800 bg-[#121214] p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-black uppercase text-neutral-500">Por enviar</p>
            <p className="mt-1 text-3xl font-black text-neutral-100">{pendingCount}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase text-neutral-500">Comanda en curso</p>
            <p className="mt-1 text-3xl font-black text-[#ffb84d]">${total.toFixed(2)}</p>
            <p className="text-sm font-bold text-neutral-400">{itemCount} producto{itemCount === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-neutral-800 pt-3 text-sm font-bold text-neutral-400">
          <WifiOff size={16} className="text-neutral-500" />
          {lastLocalChangeAt
            ? `Última actividad ${new Date(lastLocalChangeAt).toLocaleTimeString("es-MX")}`
            : "Sin ticket activo"}
        </div>
      </article>

      {failedTransactions.length > 0 && (
        <article className="mt-3 rounded-lg border border-[#ff6b6b] bg-[#121214] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 shrink-0 text-[#ff6b6b]" size={28} />
            <div className="min-w-0">
              <p className="text-lg font-black text-[#ff6b6b]">
                {failedTransactions.length} comanda{failedTransactions.length === 1 ? "" : "s"} sin enviar
              </p>
              <p className="mt-1 text-sm font-bold text-neutral-400">
                El servidor rechazó {failedTransactions.length === 1 ? "esta comanda" : "estas comandas"} varias veces. Revisa sesión, sucursal y turno, luego reintenta.
              </p>
              {failedTransactions[0]?.lastError && (
                <p className="mt-2 break-words text-sm font-bold text-neutral-500">
                  Último error: {failedTransactions[0].lastError}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={retryFailed}
            className="mt-4 flex min-h-[64px] w-full items-center justify-center gap-3 rounded-lg border border-[#ff6b6b] bg-[#18181b] px-5 text-lg font-black text-[#ff6b6b] active:scale-95 transition-all duration-150"
          >
            <RotateCw size={22} />
            Reintentar comandas fallidas
          </button>
        </article>
      )}

      {/* ── CONFIGURACIÓN ──────────────────────────────────── */}
      <p className="mb-2 mt-6 text-xs font-black uppercase tracking-widest text-neutral-500">Configuración</p>
      <div className="overflow-hidden rounded-lg border border-neutral-800 bg-[#121214]">
        <Link
          href="/setup"
          className="flex min-h-[72px] items-center gap-4 border-b border-neutral-800 px-5 active:scale-[0.98] transition-all duration-150"
        >
          <Store size={24} className="shrink-0 text-[#ffb84d]" />
          <div className="min-w-0">
            <p className="text-lg font-black text-neutral-100">Restaurante y sucursal</p>
            <p className="text-sm font-bold text-neutral-500">Vincula esta tablet a una sucursal</p>
          </div>
        </Link>
        <Link
          href="/impresion"
          className="flex min-h-[72px] items-center gap-4 px-5 active:scale-[0.98] transition-all duration-150"
        >
          <Printer size={24} className="shrink-0 text-[#ffb84d]" />
          <div className="min-w-0">
            <p className="text-lg font-black text-neutral-100">Impresión</p>
            <p className="text-sm font-bold text-neutral-500">Impresoras y auto-impresión · PIN admin</p>
          </div>
        </Link>
      </div>

      {/* ── SESIÓN ─────────────────────────────────────────── */}
      <p className="mb-2 mt-6 text-xs font-black uppercase tracking-widest text-neutral-500">Sesión</p>
      <button
        type="button"
        onClick={() => {
          logout();
          router.replace("/pin");
        }}
        className="flex min-h-[72px] w-full items-center justify-center gap-3 rounded-lg border border-neutral-800 bg-[#121214] px-5 text-xl font-black text-neutral-200 active:scale-95 transition-all duration-150"
      >
        <LogOut size={24} />
        Cambiar mesero
      </button>
    </section>
  );
}
