/**
 * useNotifications.ts
 * Escucha eventos Socket.io del backend y genera notificaciones en tiempo real.
 * Eventos: order:new, new:order (kiosk), order:updated, order:payment:confirmed
 */
"use client";
import { useEffect, useRef, useCallback } from "react";
import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { getApiUrl } from "@/lib/config";

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
  createdAt: Date;
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

export const useNotifStore = create<NotifState>((set, _get) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (n) => {
    const notif: Notification = {
      ...n,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date(),
      read: false,
    };
    set((s) => ({
      notifications: [notif, ...s.notifications].slice(0, 50), // máx 50
      unreadCount: s.unreadCount + 1,
    }));

    // Sonido de notificación (si el navegador lo permite)
    try {
      const audio = new Audio("/notification.mp3");
      audio.volume = 0.4;
      audio.play().catch(() => {});
    } catch {}
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
}));

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotifications() {
  const socketRef = useRef<Socket | null>(null);
  const { addNotification } = useNotifStore();

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

    // Señal para el auto-print (useAutoPrintOnline). Reutilizamos esta única
    // conexión de socket en vez de abrir otra: emitimos un CustomEvent local
    // con la orden cruda y dejamos que ese hook decida si imprime según el
    // toggle de la sucursal y el `source` del pedido.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tpv:order:new", { detail: order }));
    }
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
    addNotification({
      type: "order_paid",
      title: "💳 Pago confirmado",
      body: `Orden ${data.orderId || ""} · Pago procesado`,
      orderNumber: data.orderId,
    });
  }, [addNotification]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const restaurantId = localStorage.getItem("restaurantId");
    const locationId = localStorage.getItem("locationId");
    if (!restaurantId) return;

    const baseUrl = getApiUrl();

    const socket = io(baseUrl, {
      query: { restaurantId },
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
