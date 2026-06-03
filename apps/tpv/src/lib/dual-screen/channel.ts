/**
 * channel.ts
 * Comunicación local entre la ventana del cajero y la ventana de cliente
 * (segundo monitor) vía BroadcastChannel. Mismo origen, sin red ni backend.
 */

export const DUAL_SCREEN_CHANNEL = "mrtpvrest-dual-screen";

export interface CartLine {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  note?: string;
}

export interface CartSnapshot {
  lines: CartLine[];
  subtotal: number;
  discount: number;
  discountLabel?: string;
  total: number;
  currency: string;
}

export type DualScreenMessage =
  | { type: "CART_UPDATE"; payload: CartSnapshot }
  | { type: "SALE_COMPLETE"; payload: { total: number; paid?: number; change?: number } }
  | { type: "IDLE" }
  | { type: "HELLO" } // cliente → cajero al abrir la pantalla
  | { type: "STATE_SYNC"; payload: CartSnapshot }; // cajero → cliente (último estado)

/**
 * Crea el canal de comunicación. Devuelve null en SSR o si el navegador no
 * soporta BroadcastChannel.
 */
export function createDualScreenChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  try {
    return new BroadcastChannel(DUAL_SCREEN_CHANNEL);
  } catch {
    return null;
  }
}
