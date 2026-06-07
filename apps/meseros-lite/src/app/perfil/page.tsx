"use client";

import Link from "next/link";
import { AlertTriangle, Award, LogOut, Printer, RotateCw, WifiOff } from "lucide-react";
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
  const failedTransactions = useOfflineQueueStore((state) =>
    state.queue.filter((transaction) => transaction.failedPermanently),
  );
  const retryFailed = useOfflineQueueStore((state) => state.retryFailed);
  const total = ticketItems.reduce((sum, item) => sum + item.total, 0);
  const employeeName =
    employee?.name ||
    (typeof window !== "undefined" ? localStorage.getItem("currentEmployeeName") : null) ||
    "Mesero activo";

  return (
    <section className="min-h-screen bg-[#0a0a0c] px-5 py-5">
      <header className="mb-5">
        <p className="text-sm font-bold uppercase tracking-wide text-[#ffb84d]">Empleado</p>
        <h1 className="text-3xl font-black text-neutral-200">{employeeName}</h1>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <article className="rounded-lg border border-neutral-800 bg-[#121214] p-5">
          <Award className="mb-4 text-[#ffb84d]" size={34} />
          <p className="text-sm font-bold uppercase text-neutral-500">Puntos del turno</p>
          <p className="mt-2 text-5xl font-black text-neutral-100">{ticketItems.length * 15} XP</p>
        </article>

        <article className="rounded-lg border border-neutral-800 bg-[#121214] p-5">
          <WifiOff className="mb-4 text-[#ffb84d]" size={34} />
          <p className="text-sm font-bold uppercase text-neutral-500">Respaldo local</p>
          <p className="mt-2 text-3xl font-black text-neutral-100">${total.toFixed(2)}</p>
          <p className="mt-2 text-sm font-bold text-neutral-400">
            {lastLocalChangeAt ? `Ultimo cambio ${new Date(lastLocalChangeAt).toLocaleTimeString("es-MX")}` : "Sin ticket activo"}
          </p>
        </article>
      </div>

      {failedTransactions.length > 0 && (
        <article className="mt-3 rounded-lg border border-[#ff6b6b] bg-[#121214] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 shrink-0 text-[#ff6b6b]" size={28} />
            <div className="min-w-0">
              <p className="text-lg font-black text-[#ff6b6b]">
                {failedTransactions.length} comanda{failedTransactions.length === 1 ? "" : "s"} sin enviar
              </p>
              <p className="mt-1 text-sm font-bold text-neutral-400">
                El servidor rechazó {failedTransactions.length === 1 ? "esta comanda" : "estas comandas"} varias veces. Revisa sesion, sucursal y turno, luego reintenta.
              </p>
              {failedTransactions[0]?.lastError && (
                <p className="mt-2 break-words text-sm font-bold text-neutral-500">
                  Ultimo error: {failedTransactions[0].lastError}
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

      <Link
        href="/impresion"
        className="mt-3 flex min-h-[72px] items-center justify-center gap-3 rounded-lg border border-neutral-800 bg-[#121214] px-5 text-xl font-black text-neutral-200 active:scale-95 transition-all duration-150"
      >
        <Printer size={24} />
        Impresión (admin)
      </Link>

      <Link
        href="/setup"
        className="mt-3 flex min-h-[72px] items-center justify-center rounded-lg border border-[#ffb84d] bg-[#ffb84d] px-5 text-xl font-black text-[#0a0a0c] active:scale-95 transition-all duration-150"
      >
        Configurar restaurante y sucursal
      </Link>

      <button
        type="button"
        onClick={() => {
          logout();
          router.replace("/pin");
        }}
        className="mt-3 flex min-h-[72px] w-full items-center justify-center gap-3 rounded-lg border border-neutral-800 bg-[#121214] px-5 text-xl font-black text-neutral-200 active:scale-95 transition-all duration-150"
      >
        <LogOut size={24} />
        Cambiar mesero
      </button>
    </section>
  );
}
