"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import type { PrinterRecord } from "@/lib/printer-tcp";

/**
 * Carga + normaliza las impresoras de la sucursal y se mantiene viva en
 * memoria (recargando ante el evento global `printers-changed`).
 *
 * El backend devuelve `printerGroups: [{ printerGroup: { id } }]` y el
 * dispatcher de printer-tcp consume `printerGroupIds: string[]`. Aquí
 * hacemos esa derivación una sola vez para que los consumers (drawer,
 * modal de detalle, vista de mesa) no la repitan.
 */
type RawPrinter = PrinterRecord & {
  printerGroups?: Array<{ printerGroup?: { id: string } }>;
};

function normalize(list: RawPrinter[]): PrinterRecord[] {
  return list.map((p) => ({
    ...p,
    printerGroupIds: (p.printerGroups ?? [])
      .map((m) => m.printerGroup?.id)
      .filter((id): id is string => Boolean(id)),
  }));
}

export function usePrinters() {
  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<RawPrinter[]>("/api/printers");
      setPrinters(Array.isArray(data) ? normalize(data) : []);
    } catch {
      setPrinters([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const onRefresh = () => load();
    if (typeof window !== "undefined") {
      window.addEventListener("printers-changed", onRefresh);
      return () => window.removeEventListener("printers-changed", onRefresh);
    }
    return undefined;
  }, [load]);

  return { printers, loaded, reload: load };
}

/**
 * Lee la identidad del restaurante desde localStorage (poblada por
 * useTPVAuth). La usamos como header del recibo CASHIER. No bloquea
 * la impresión si no está disponible.
 */
export function useReceiptIdentity() {
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [businessFooter, setBusinessFooter] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBusinessName(localStorage.getItem("restaurantName"));
    setBusinessFooter(localStorage.getItem("receiptFooter"));
  }, []);

  return { businessName, businessFooter };
}
