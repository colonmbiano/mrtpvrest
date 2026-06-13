"use client";

import { useCallback, useEffect } from "react";
import { fetchPrinterConfiguration } from "@/lib/printer-config";
import { useEmployeeSessionStore } from "@/store/useEmployeeSessionStore";
import { usePrinterStore } from "@/store/usePrinterStore";

export default function PrinterConfigInitializer() {
  const isAuthenticated = useEmployeeSessionStore((state) => state.isAuthenticated);
  const setPrinters = usePrinterStore((state) => state.setPrinters);
  const setKitchenConfig = usePrinterStore((state) => state.setKitchenConfig);

  const sync = useCallback(async () => {
    const hasToken =
      typeof window !== "undefined" && Boolean(localStorage.getItem("tpv-employee-token"));
    if (!isAuthenticated && !hasToken) return;

    try {
      const config = await fetchPrinterConfiguration();
      setPrinters(config.printers);
      setKitchenConfig(config.kitchenConfig);
    } catch {
      // Conserva la ultima configuracion valida para poder operar offline.
    }
  }, [isAuthenticated, setKitchenConfig, setPrinters]);

  useEffect(() => {
    void sync();

    const refresh = () => {
      if (document.visibilityState === "visible") void sync();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [sync]);

  return null;
}
