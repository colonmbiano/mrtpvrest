"use client";
import { useEffect } from "react";
import { applyAccent } from "@/lib/theme/accent";

/**
 * Inyecta el color de marca del tenant (localStorage['mb-accent'])
 * derivando toda la familia de acento (brand + soft/glow/contrast).
 * Re-deriva cuando cambia el tema (data-theme) o el acento en otra pestaña.
 */
export function AccentInjector() {
  useEffect(() => {
    const sync = () => applyAccent(localStorage.getItem("mb-accent"));
    sync();

    const observer = new MutationObserver((muts) => {
      if (muts.some((m) => m.attributeName === "data-theme")) sync();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const onStorage = (e: StorageEvent) => {
      if (e.key === "mb-accent") sync();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
