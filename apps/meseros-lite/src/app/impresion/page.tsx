"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { fetchPrinterConfiguration } from "@/lib/printer-config";
import { printTestTicket, type PrinterRecord, type PrinterStation } from "@/lib/printer";
import { usePrinterStore } from "@/store/usePrinterStore";

function stationOf(printer: PrinterRecord): PrinterStation {
  const type = String(printer.type || "").toUpperCase();
  if (type === "CASHIER" || type === "BAR") return type;
  return "KITCHEN";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ImpresionPage() {
  const router = useRouter();
  const printers = usePrinterStore((state) => state.printers);
  const autoPrint = usePrinterStore((state) => state.autoPrint);
  const lastSync = usePrinterStore((state) => state.lastSync);
  const setPrinters = usePrinterStore((state) => state.setPrinters);
  const setKitchenConfig = usePrinterStore((state) => state.setKitchenConfig);
  const setAutoPrint = usePrinterStore((state) => state.setAutoPrint);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  const syncPrinters = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const config = await fetchPrinterConfiguration();
      setPrinters(config.printers);
      setKitchenConfig(config.kitchenConfig);
      setMessage(
        `Configuracion del TPV actualizada: ${config.printers.length} impresora${
          config.printers.length === 1 ? "" : "s"
        }.`,
      );
    } catch (syncError) {
      setError(errorMessage(syncError, "No se pudo actualizar la configuracion del TPV."));
    } finally {
      setLoading(false);
    }
  };

  const testPrinter = async (printer: PrinterRecord) => {
    setTestingId(printer.id);
    setError("");
    setMessage("");
    try {
      await printTestTicket({ ip: printer.ip || "", port: printer.port }, stationOf(printer));
      setMessage(`Prueba enviada a ${printer.name}.`);
    } catch (testError) {
      setError(`${printer.name}: ${errorMessage(testError, "Fallo al imprimir.")}`);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <section className="min-h-screen bg-[#0a0a0c] px-5 py-5 pb-28 text-neutral-200">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-[#ffb84d]">Configuracion TPV</p>
          <h1 className="truncate text-3xl font-black text-neutral-200">Impresion</h1>
        </div>
        <button
          type="button"
          onClick={() => router.replace("/perfil")}
          className="flex min-h-[56px] items-center gap-2 rounded-lg border border-neutral-800 bg-[#121214] px-4 text-base font-black text-neutral-300 active:scale-95 transition-all duration-150"
        >
          <ArrowLeft size={20} />
          Volver
        </button>
      </header>

      {(error || message) && (
        <p
          className={[
            "mb-4 rounded-lg border p-4 text-base font-black",
            error
              ? "border-[#ff6b6b] bg-[#121214] text-[#ff6b6b]"
              : "border-[#ffb84d] bg-[#121214] text-[#ffb84d]",
          ].join(" ")}
        >
          {error || message}
        </p>
      )}

      <article className="mb-4 rounded-lg border border-neutral-800 bg-[#121214] p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-black text-neutral-100">Auto-imprimir desde esta tablet</p>
            <p className="mt-1 text-sm font-bold text-neutral-400">
              Preferencia local. Las impresoras, el ruteo y el formato son los mismos del TPV.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoPrint}
            onClick={() => setAutoPrint(!autoPrint)}
            className={[
              "relative h-11 w-20 shrink-0 rounded-full border transition-all duration-150",
              autoPrint ? "border-[#88d66c] bg-[#88d66c]" : "border-neutral-700 bg-[#18181b]",
            ].join(" ")}
            aria-label="Activar auto-impresion"
          >
            <span
              className={[
                "absolute top-1 h-8 w-8 rounded-full bg-[#0a0a0c] transition-all duration-150",
                autoPrint ? "left-11" : "left-1",
              ].join(" ")}
            />
          </button>
        </div>
      </article>

      <article className="mb-4 rounded-lg border border-neutral-800 bg-[#121214] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-neutral-100">Configuracion central</p>
            <p className="mt-1 text-sm font-bold text-neutral-400">
              {lastSync
                ? `${printers.length} impresora${printers.length === 1 ? "" : "s"} · actualizada ${new Date(
                    lastSync,
                  ).toLocaleTimeString("es-MX")}`
                : "Se actualiza automaticamente al iniciar sesion"}
            </p>
          </div>
          <button
            type="button"
            onClick={syncPrinters}
            disabled={loading}
            className="flex min-h-[64px] items-center gap-2 rounded-lg border border-[#ffb84d] bg-[#18181b] px-4 text-base font-black text-[#ffb84d] active:scale-95 transition-all duration-150 disabled:opacity-50"
          >
            <RefreshCw size={22} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </article>

      {printers.length === 0 ? (
        <div className="grid gap-3 rounded-lg border border-neutral-800 bg-[#121214] p-5 text-center">
          <Printer className="mx-auto text-[#ffb84d]" size={34} />
          <p className="text-xl font-black text-neutral-100">No hay impresoras configuradas</p>
          <p className="text-base font-bold text-neutral-400">
            Agregalas en TPV / Administracion / Impresion. Meseros Lite las recibira automaticamente.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {printers.map((printer) => (
            <article
              key={printer.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-[#121214] p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-lg font-black text-neutral-100">{printer.name}</p>
                <p className="mt-1 text-sm font-bold text-neutral-400">
                  {stationOf(printer)} · {printer.ip || "sin IP"}
                  {printer.port ? `:${printer.port}` : ""} · {printer.connectionType}
                  {printer.isActive ? "" : " · inactiva"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => testPrinter(printer)}
                disabled={
                  testingId === printer.id ||
                  printer.connectionType !== "NETWORK" ||
                  !printer.ip ||
                  printer.ip === "0.0.0.0"
                }
                className="flex min-h-[64px] shrink-0 items-center justify-center rounded-lg border border-[#ffb84d] bg-[#18181b] px-4 text-base font-black text-[#ffb84d] active:scale-95 transition-all duration-150 disabled:border-neutral-800 disabled:text-neutral-600"
              >
                {testingId === printer.id ? "Enviando..." : "Probar"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
