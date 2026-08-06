"use client";

/**
 * WebUsbPrinterCard — vinculación y prueba de la impresora térmica LOCAL cuando
 * el TPV corre en un navegador de escritorio (Chrome/Edge), no en el APK.
 *
 * En el APK la impresión es TCP nativo al puerto 9100 (impresoras de red). Un
 * navegador no puede abrir sockets TCP, así que la térmica enchufada por USB a
 * la misma PC se maneja por WebUSB (ver lib/printer-usb.ts). Esta tarjeta:
 *   - Vincula la impresora (diálogo del navegador; exige un click del usuario).
 *   - Recuerda la elección para que los tickets del POS salgan automáticos.
 *   - Permite una impresión de prueba y disparar el cajón para validar.
 *
 * Solo se muestra si el navegador soporta WebUSB; en el APK nativo (o navegadores
 * sin soporte) no aparece, para no confundir con la ruta TCP de red.
 */

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Usb, Printer as PrinterIcon, Inbox, Link2, Unlink } from "lucide-react";
import {
  isWebUsbAvailable,
  pairUsbPrinter,
  clearUsbPrinter,
  getPairedPrinterName,
  hasUsablePairedPrinter,
} from "@/lib/printer-usb";
import { printTestTicket, openCashDrawer } from "@/lib/printer-tcp";

export default function WebUsbPrinterCard() {
  const [supported, setSupported] = useState(false);
  const [pairedName, setPairedName] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "pair" | "test" | "drawer">(null);

  const refresh = async () => {
    const usable = await hasUsablePairedPrinter();
    setPairedName(usable ? await getPairedPrinterName() : null);
  };

  useEffect(() => {
    let cancelled = false;
    // Deferido (patrón del resto del TPV): evita set-state síncrono en effect.
    queueMicrotask(() => {
      if (cancelled) return;
      const ok = isWebUsbAvailable();
      setSupported(ok);
      if (ok) void refresh();
    });
    return () => { cancelled = true; };
  }, []);

  // En el APK nativo o navegadores sin WebUSB, la impresión va por TCP de red:
  // esta tarjeta no aplica.
  if (!supported) return null;

  const handlePair = async () => {
    if (busy) return;
    setBusy("pair");
    try {
      const info = await pairUsbPrinter();
      setPairedName(info.name ?? "Impresora USB");
      toast.success(`Impresora vinculada: ${info.name ?? "USB"}`);
    } catch (err) {
      const e = err as { name?: string; message?: string };
      // El usuario cerró el diálogo sin elegir → no es un error real.
      if (e?.name === "NotFoundError") {
        toast.message("No se seleccionó ninguna impresora.");
      } else {
        toast.error("No se pudo vincular: " + (e?.message || "fallo"));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleUnpair = () => {
    clearUsbPrinter();
    setPairedName(null);
    toast.success("Impresora USB desvinculada");
  };

  const handleTest = async () => {
    if (busy) return;
    setBusy("test");
    try {
      // El target TCP es ignorado en navegador (se usa la impresora USB); se
      // pasa un placeholder para cumplir la firma.
      await printTestTicket({ ip: "0.0.0.0", port: 9100 }, "CASHIER");
      toast.success("Prueba enviada a la impresora USB");
    } catch (err) {
      const e = err as { message?: string };
      toast.error("Error en prueba: " + (e?.message || "fallo USB"));
    } finally {
      setBusy(null);
    }
  };

  const handleDrawer = async () => {
    if (busy) return;
    setBusy("drawer");
    try {
      const res = await openCashDrawer([]);
      if (res.ok > 0) toast.success("Cajón abierto");
      else toast.error("No se abrió el cajón: " + (res.failed[0]?.error || "fallo"));
    } catch (err) {
      const e = err as { message?: string };
      toast.error("Error al abrir cajón: " + (e?.message || "fallo"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-6 bg-[var(--surface-1)] rounded-[2rem] border border-white/5 p-6">
      <div className="flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-iris-soft text-iris-500 flex items-center justify-center shrink-0">
            <Usb size={24} />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              Impresora local (Chrome)
              <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg bg-white/5 text-zinc-400">
                WebUSB
              </span>
            </h3>
            {pairedName ? (
              <p className="text-xs font-bold text-emerald-500 flex items-center gap-1.5 truncate">
                <PrinterIcon size={13} /> {pairedName}
              </p>
            ) : (
              <p className="text-xs font-medium text-zinc-500">
                Impresora térmica USB de esta PC — imprime tickets y abre el cajón sin instalar nada.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={handlePair}
            disabled={busy !== null}
            className="h-11 px-4 bg-iris-500 text-iris-fg rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            <Link2 size={15} /> {busy === "pair" ? "Abriendo…" : pairedName ? "Cambiar" : "Vincular"}
          </button>
          <button
            onClick={handleTest}
            disabled={busy !== null || !pairedName}
            className="h-11 px-4 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl text-xs font-semibold uppercase tracking-widest transition-all disabled:opacity-40 flex items-center gap-2"
          >
            <PrinterIcon size={15} /> {busy === "test" ? "Enviando…" : "Prueba"}
          </button>
          <button
            onClick={handleDrawer}
            disabled={busy !== null || !pairedName}
            className="h-11 px-4 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl text-xs font-semibold uppercase tracking-widest transition-all disabled:opacity-40 flex items-center gap-2"
          >
            <Inbox size={15} /> {busy === "drawer" ? "Abriendo…" : "Cajón"}
          </button>
          {pairedName && (
            <button
              onClick={handleUnpair}
              disabled={busy !== null}
              className="h-11 px-3 bg-red-500/5 hover:bg-red-500/10 text-red-500/60 hover:text-red-500 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center"
              title="Desvincular"
            >
              <Unlink size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
