"use client";
import { useEffect, useState } from "react";
import { get } from "idb-keyval";
import type { PrinterRecord } from "@/lib/printer-tcp";
import { normalizePrinters } from "@/lib/tokki-printers";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";

export function usePrinters() {
  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const employeeId = useAuthStore(s => s.employee?.id);

  useEffect(() => {
    let stopped = false;
    let remote: PrinterRecord[] = [];
    // Polling local config for simplicity
    const load = async () => {
      try {
        const local = await get<PrinterRecord[]>("tokki-printers");
        const normalized = normalizePrinters(local || []);
        if (!stopped) setPrinters([...normalized, ...remote.filter(p => !normalized.some(l => l.id === p.id || (l.ip && l.ip === p.ip && l.port === p.port)))]);
      } catch (e) {
        console.error("Error reading printers", e);
      } finally {
        setLoaded(true);
      }
    };
    
    void load();
    if (employeeId) void api.get<PrinterRecord[]>("/api/printers", { timeout: 8000 }).then(({ data }) => { remote = normalizePrinters(data); return load(); }).catch(() => { /* Las impresoras locales siguen disponibles sin red. */ });
    const changed = () => { void load(); };
    window.addEventListener("tokki-printers-changed", changed);
    const interval = setInterval(load, 2000);
    return () => { stopped = true; clearInterval(interval); window.removeEventListener("tokki-printers-changed", changed); };
  }, [employeeId]);

  return { printers, loaded };
}
