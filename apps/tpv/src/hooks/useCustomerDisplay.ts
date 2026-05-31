/**
 * useCustomerDisplay.ts — lado cliente
 * Crea el canal, anuncia su llegada con HELLO y mapea los mensajes entrantes
 * a un estado de vista (`idle` | `cart` | `complete`).
 */
"use client";
import { useEffect, useRef, useState } from "react";
import {
  createDualScreenChannel,
  DualScreenMessage,
  CartSnapshot,
} from "@/lib/dual-screen/channel";

export type DisplayState =
  | { view: "idle" }
  | { view: "cart"; snapshot: CartSnapshot }
  | { view: "complete"; total: number; paid?: number; change?: number };

export function useCustomerDisplay() {
  const [state, setState] = useState<DisplayState>({ view: "idle" });
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const channel = createDualScreenChannel();
    channelRef.current = channel;
    if (!channel) return;

    const applySnapshot = (snapshot: CartSnapshot) => {
      if (!snapshot || !snapshot.lines || snapshot.lines.length === 0) {
        setState({ view: "idle" });
      } else {
        setState({ view: "cart", snapshot });
      }
    };

    channel.onmessage = (ev: MessageEvent<DualScreenMessage>) => {
      const msg = ev.data;
      if (!msg) return;
      switch (msg.type) {
        case "CART_UPDATE":
        case "STATE_SYNC":
          applySnapshot(msg.payload);
          break;
        case "SALE_COMPLETE":
          setState({
            view: "complete",
            total: msg.payload.total,
            paid: msg.payload.paid,
            change: msg.payload.change,
          });
          break;
        case "IDLE":
          setState({ view: "idle" });
          break;
        default:
          break;
      }
    };

    // Anunciar al cajero que la pantalla abrió → responderá con STATE_SYNC.
    channel.postMessage({ type: "HELLO" } as DualScreenMessage);

    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, []);

  return state;
}
