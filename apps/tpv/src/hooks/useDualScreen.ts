/**
 * useDualScreen.ts — lado cajero
 * Lee la config del doble pantalla, abre/cierra el BroadcastChannel según
 * `enabled`, y expone acciones para empujar el carrito a la pantalla de
 * cliente. Todas las acciones son no-op si la función está desactivada.
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDualScreenChannel,
  DualScreenMessage,
  CartSnapshot,
} from "@/lib/dual-screen/channel";
import {
  getDualScreenConfig,
  DualScreenConfig,
  DUAL_SCREEN_CONFIG_EVENT,
  DUAL_SCREEN_CONFIG_KEY,
} from "@/lib/dual-screen/config";

const EMPTY_SNAPSHOT: CartSnapshot = {
  lines: [],
  subtotal: 0,
  discount: 0,
  total: 0,
  currency: "MXN",
};

export function useDualScreen() {
  const [config, setConfig] = useState<DualScreenConfig>(() => getDualScreenConfig());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastSnapshotRef = useRef<CartSnapshot>(EMPTY_SNAPSHOT);

  const enabled = config.enabled;

  // Refrescar config cuando cambie (en esta ventana o en otra).
  useEffect(() => {
    const refresh = () => setConfig(getDualScreenConfig());
    const onStorage = (e: StorageEvent) => {
      if (e.key === DUAL_SCREEN_CONFIG_KEY) refresh();
    };
    window.addEventListener(DUAL_SCREEN_CONFIG_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DUAL_SCREEN_CONFIG_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Abrir/cerrar el canal según `enabled`. Responder a HELLO con STATE_SYNC.
  useEffect(() => {
    if (!enabled) {
      channelRef.current?.close();
      channelRef.current = null;
      return;
    }
    const channel = createDualScreenChannel();
    channelRef.current = channel;
    if (!channel) return;

    channel.onmessage = (ev: MessageEvent<DualScreenMessage>) => {
      if (ev.data?.type === "HELLO") {
        channel.postMessage({ type: "STATE_SYNC", payload: lastSnapshotRef.current });
      }
    };

    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [enabled]);

  const post = useCallback((msg: DualScreenMessage) => {
    channelRef.current?.postMessage(msg);
  }, []);

  const pushCart = useCallback(
    (snapshot: CartSnapshot) => {
      if (!enabled) return;
      lastSnapshotRef.current = snapshot;
      post({ type: "CART_UPDATE", payload: snapshot });
    },
    [enabled, post]
  );

  const completeSale = useCallback(
    (payload: { total: number; paid?: number; change?: number }) => {
      if (!enabled) return;
      post({ type: "SALE_COMPLETE", payload });
    },
    [enabled, post]
  );

  const setIdle = useCallback(() => {
    if (!enabled) return;
    lastSnapshotRef.current = EMPTY_SNAPSHOT;
    post({ type: "IDLE" });
  }, [enabled, post]);

  /**
   * Abre la ventana de cliente. Intenta colocarla en una pantalla externa
   * usando Window Management API; si no, abre un popup normal. DEBE llamarse
   * desde un gesto de usuario (click).
   */
  const openDisplay = useCallback(async () => {
    if (!enabled || typeof window === "undefined") return;
    const url = "/customer-display";
    const name = "mrtpvrest-customer-display";

    try {
      // @ts-expect-error — Window Management API aún no está en todos los tipos
      if (typeof window.getScreenDetails === "function") {
        // @ts-expect-error — idem
        const details = await window.getScreenDetails();
        const current = details.currentScreen;
        const external =
          details.screens.find(
            (s: any) => s.isInternal === false || s !== current
          ) || current;
        if (external) {
          const features = `left=${external.availLeft},top=${external.availTop},width=${external.availWidth},height=${external.availHeight}`;
          const win = window.open(url, name, features);
          if (win) return;
        }
      }
    } catch {
      /* fallback abajo */
    }

    window.open(url, name, "width=1024,height=768");
  }, [enabled]);

  const closeDisplay = useCallback(() => {
    if (typeof window === "undefined") return;
    const win = window.open("", "mrtpvrest-customer-display");
    win?.close();
  }, []);

  return {
    enabled,
    config,
    pushCart,
    completeSale,
    setIdle,
    openDisplay,
    closeDisplay,
  };
}
