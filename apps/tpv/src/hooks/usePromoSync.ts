/**
 * usePromoSync.ts
 * Sincroniza las promos del negocio al montar y cada `intervalMin` minutos,
 * pero solo si el doble pantalla está habilitado. Llamar UNA vez en el root
 * del TPV.
 */
"use client";
import { useEffect } from "react";
import { syncRemotePromos } from "@/lib/dual-screen/sync";
import {
  getDualScreenConfig,
  DUAL_SCREEN_CONFIG_EVENT,
} from "@/lib/dual-screen/config";

export function usePromoSync(intervalMin = 10) {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      if (!getDualScreenConfig().enabled) return;
      // Sync inmediato + periódico.
      void syncRemotePromos();
      timer = setInterval(() => {
        if (getDualScreenConfig().enabled) void syncRemotePromos();
      }, intervalMin * 60 * 1000);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onConfigChange = () => {
      if (getDualScreenConfig().enabled) start();
      else stop();
    };

    start();
    window.addEventListener(DUAL_SCREEN_CONFIG_EVENT, onConfigChange);
    return () => {
      stop();
      window.removeEventListener(DUAL_SCREEN_CONFIG_EVENT, onConfigChange);
    };
  }, [intervalMin]);
}
