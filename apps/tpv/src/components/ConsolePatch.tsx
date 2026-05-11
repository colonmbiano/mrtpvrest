"use client";
import { useEffect } from "react";

/**
 * Capacitor's WebView Console plugin serializa cada argumento con toString(),
 * lo que convierte objetos en el famoso "[object Object]" y satura logcat.
 *
 * Este patch envuelve console.log/info/warn/error para que cualquier argumento
 * objeto se serialice con JSON.stringify (con guard contra refs circulares).
 * Solo se aplica una vez en el cliente.
 */
export default function ConsolePatch() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    if (w.__consolePatched) return;
    w.__consolePatched = true;

    const seen = new WeakSet<object>();
    const safe = (arg: unknown): unknown => {
      if (arg === null || typeof arg !== "object") return arg;
      try {
        return JSON.stringify(arg, (_k, v) => {
          if (typeof v === "object" && v !== null) {
            if (seen.has(v)) return "[Circular]";
            seen.add(v);
          }
          return v;
        });
      } catch {
        return Object.prototype.toString.call(arg);
      } finally {
        // WeakSet no se puede limpiar, se descarta junto a la llamada
      }
    };

    (["log", "info", "warn", "error", "debug"] as const).forEach((level) => {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        original(...args.map(safe));
      };
    });
  }, []);

  return null;
}
