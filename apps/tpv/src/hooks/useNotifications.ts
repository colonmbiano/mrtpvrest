/**
 * useNotifications.ts
 * Escucha eventos Socket.io del backend y genera notificaciones en tiempo real.
 * Eventos: order:new, new:order (kiosk), order:updated, order:payment:confirmed
 */
"use client";
import { useEffect, useRef, useCallback } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { io, Socket } from "socket.io-client";
import { getApiUrl } from "@/lib/config";
import { getTenantIds } from "@/lib/tenant";
import {
  playNotificationSound,
  primeNotificationSound,
} from "@/lib/notificationSound";
import {
  ensureNotifPermission,
  fireLocalNotification,
} from "@/lib/localNotifications";

// Etiqueta legible del método de pago para el cuerpo de la notificación.
const PAY_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  CARD_PRESENT: "Tarjeta",
  TRANSFER: "Transferencia",
  SPEI: "Transferencia",
  ONLINE: "En línea",
};

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type NotifType =
  | "order_new"        // Nuevo pedido online (tienda)
  | "order_kiosk"      // Pedido de kiosko
  | "order_ready"      // Orden lista en cocina
  | "order_delivered"  // Entrega confirmada por repartidor
  | "order_paid"       // Pago confirmado
  | "order_updated";   // Cambio de estado genérico

export interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  orderNumber?: string;
  total?: number;
  /** Epoch ms. Número (no Date) para que sobreviva a la serialización del
   *  persist de zustand sin romperse al rehidratar. */
  createdAt: number;
  read: boolean;
}

// ─── Store Zustand ────────────────────────────────────────────────────────────

interface NotifState {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Omit<Notification, "id" | "createdAt" | "read">) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clear: () => void;
}

// Persistido en localStorage para que las notificaciones (y el contador sin
// leer) sobrevivan a recargas / reinicios de la terminal: un pedido web que
// entró mientras el TPV estaba cerrado no se pierde de la bandeja.
export const useNotifStore = create<NotifState>()(
  persist(
    (set, _get) => ({
      notifications: [],
      unreadCount: 0,

      addNotification: (n) => {
        const notif: Notification = {
          ...n,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          createdAt: Date.now(),
          read: false,
        };
        set((s) => ({
          notifications: [notif, ...s.notifications].slice(0, 50), // máx 50
          unreadCount: s.unreadCount + 1,
        }));

        // Timbre de notificación vía Web Audio (ver notificationSound.ts). El
        // <audio src="/notification.mp3"> anterior daba 404 —el asset no existe
        // en apps/tpv/public— así que ningún pedido web sonaba.
        playNotificationSound();
      },

      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        })),

      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, s.unreadCount - 1),
        })),

      clear: () => set({ notifications: [], unreadCount: 0 }),
    }),
    {
      name: "tpv-notifications",
      storage: createJSONStorage(() => localStorage),
      // No persistimos las funciones, solo los datos.
      partialize: (s) => ({
        notifications: s.notifications,
        unreadCount: s.unreadCount,
      }),
    },
  ),
);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotifications(opts?: { onOrderNew?: (order: any) => void }) {
  const socketRef = useRef<Socket | null>(null);
  const { addNotification } = useNotifStore();

  // El callback se guarda en un ref que se refresca en cada render, así
  // handleOrderNew permanece estable (no re-suscribe el socket) pero siempre
  // invoca la última versión del consumidor (p.ej. la auto-impresión del POS).
  const onOrderNewRef = useRef(opts?.onOrderNew);
  onOrderNewRef.current = opts?.onOrderNew;

  const handleOrderNew = useCallback((order: any) => {
    const isOnline =
      order.source === "STORE" ||
      order.source === "ONLINE" ||
      !order.source; // pedidos de la tienda online

    addNotification({
      type: "order_new",
      title: isOnline ? "🛍️ Pedido en línea recibido" : "🧾 Nuevo pedido",
      body: `${order.orderNumber || `#${String(order.id).slice(-6).toUpperCase()}`} · ${
        order.customerName || "Cliente"
      } · $${Number(order.total ?? 0).toFixed(2)}`,
      orderNumber: order.orderNumber,
      total: Number(order.total ?? 0),
    });

    // Hook para consumidores que necesitan reaccionar al pedido entrante
    // (auto-impresión de comanda en la caja). No debe romper la notificación.
    try { onOrderNewRef.current?.(order); } catch { /* noop */ }
  }, [addNotification]);

  const handleOrderKiosk = useCallback((data: any) => {
    addNotification({
      type: "order_kiosk",
      title: "🖥️ Pedido de kiosko",
      body: `Orden ${data.orderId || ""} · Requiere confirmación`,
      orderNumber: data.orderId,
    });
  }, [addNotification]);

  const handleOrderUpdated = useCallback((order: any) => {
    if (order.status === "DELIVERED") {
      addNotification({
        type: "order_delivered",
        title: "✅ Entrega confirmada",
        body: `${order.orderNumber || ""} · ${order.customerName || "Cliente"} ha recibido su pedido`,
        orderNumber: order.orderNumber,
        total: Number(order.total ?? 0),
      });
    } else if (order.status === "READY") {
      addNotification({
        type: "order_ready",
        title: "🍳 Orden lista en cocina",
        body: `${order.orderNumber || ""} · Lista para entregar`,
        orderNumber: order.orderNumber,
      });
    }
    // otros estados no generan notificación (demasiado ruido)
  }, [addNotification]);

  const handleOrderPaid = useCallback((data: any) => {
    const folio =
      data.orderNumber ||
      (data.orderId ? `#${String(data.orderId).slice(-6).toUpperCase()}` : "");
    const monto =
      typeof data.total === "number" ? ` · $${Number(data.total).toFixed(2)}` : "";
    const metodo = data.paymentMethod
      ? ` · ${PAY_LABEL[data.paymentMethod] || data.paymentMethod}`
      : "";
    const body = `Pedido ${folio}${monto}${metodo}`.trim();

    addNotification({
      type: "order_paid",
      title: "💳 Pago confirmado",
      body,
      orderNumber: data.orderNumber || undefined,
      total: typeof data.total === "number" ? data.total : undefined,
    });

    // Push nativo en la bandeja de Android (tablet de caja): se ve aunque el
    // TPV esté minimizado. No-op en web (ahí basta el aviso in-app + sonido).
    fireLocalNotification("💳 Pago confirmado", body);
  }, [addNotification]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Desbloquea el audio en el primer gesto del cajero para sortear la
    // política de autoplay; sin esto el primer pedido web no sonaría.
    primeNotificationSound();

    // Pide (una vez) permiso de notificaciones nativas para el push de pago
    // confirmado en la bandeja de Android. No-op en web.
    ensureNotifPermission().catch(() => {});

    const { restaurantId, locationId } = getTenantIds();
    if (!restaurantId) return;

    const baseUrl = getApiUrl();

    // El backend solo une el socket a los rooms de notificaciones
    // (`restaurant:…:admins`) si el handshake trae un token JWT válido cuyo
    // restaurantId coincide con el de la query —ver el guard `canJoinRestaurant`
    // en apps/backend/src/index.js—. Sin token, `socket.data.user` queda null,
    // el guard falla y la tablet NO se une a ningún room: no llega ni un pedido
    // web (`order:new`) ni una entrega del repartidor (`order:updated`). El
    // token del TPV (PIN de empleado o device) ya incluye restaurantId, así que
    // pasarlo en `auth` es todo lo que hace falta. Mismo orden de búsqueda que
    // el interceptor de api.ts para no divergir.
    const token =
      sessionStorage.getItem("tpv-access-token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("tpv-employee-token");

    const socket = io(baseUrl, {
      query: { restaurantId },
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      // Unirse al room de admins de esta sucursal
      socket.emit("join:admin");
      if (locationId) {
        socket.emit("join:location:admin", locationId);
      }
    });

    socket.on("order:new",               handleOrderNew);
    socket.on("new:order",               handleOrderKiosk);
    socket.on("order:updated",           handleOrderUpdated);
    socket.on("order:paid",              handleOrderPaid);
    socket.on("order:payment:confirmed", handleOrderPaid);

    return () => {
      socket.off("order:new",               handleOrderNew);
      socket.off("new:order",               handleOrderKiosk);
      socket.off("order:updated",           handleOrderUpdated);
      socket.off("order:paid",              handleOrderPaid);
      socket.off("order:payment:confirmed", handleOrderPaid);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [handleOrderNew, handleOrderKiosk, handleOrderUpdated, handleOrderPaid]);
}
