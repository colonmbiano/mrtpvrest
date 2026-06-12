/**
 * useOpenOrders.ts
 * Mantiene en vivo la lista de "Tickets abiertos" del TPV usando Socket.io,
 * en lugar del polling de 30s que re-renderizaba toda la pantalla.
 *
 * Reusa el mismo patrón de conexión/handshake que useNotifications (token en
 * `auth`, restaurantId en `query`, join:admin + join:location:admin). El
 * backend emite `order:new` / `order:updated` / `order:created` al room
 * `restaurant:{r}:location:{l}:admins` cada vez que se crea/actualiza/divide
 * una orden, así que aquí solo reconciliamos la orden afectada — sin re-fetch
 * global y sin parpadeos periódicos.
 *
 * Fallbacks:
 *   · Carga inicial diferida al montar (un solo fetch).
 *   · Resync en cada (re)connect del socket: cubre el hueco mientras estuvo
 *     caído.
 *   · `refresh()` expuesto para fetch-on-demand tras mutaciones del usuario
 *     (merge, asignar repartidor, etc.) — es one-shot, no un bucle.
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { getApiUrl } from "@/lib/config";
import { getTenantIds } from "@/lib/tenant";
import api from "@/lib/api";

// Mismos estados "abiertos" que el backend (ACTIVE_ORDER_STATUSES en
// orders.routes.js). ON_THE_WAY = asignado a repartidor, sigue abierto.
const ACTIVE_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OPEN",
  "ON_THE_WAY",
]);

export interface UseOpenOrders {
  orders: any[];
  /** Fetch one-shot del listado (carga inicial / tras mutaciones del usuario). */
  refresh: () => Promise<void>;
}

export function useOpenOrders(enabled: boolean): UseOpenOrders {
  const [orders, setOrders] = useState<any[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const refresh = useCallback(async () => {
    try {
      // scope=active → el backend ya filtra a pedidos abiertos (payload chico).
      // Mantenemos el filtro cliente como red de seguridad.
      const { data } = await api.get("/api/orders/admin?scope=active");
      const list = Array.isArray(data) ? data : [];
      setOrders(list.filter((o: any) => ACTIVE_STATUSES.has(o.status)));
    } catch (err) {
      console.error("Error cargando órdenes abiertas:", err);
    }
  }, []);

  // Reconciliación no destructiva de UNA orden llegada por socket. Si dejó de
  // estar abierta (DELIVERED/CANCELLED) se quita del listado; si ya existe se
  // mergea sobre lo que había (algunos emits —p.ej. el de pago— no incluyen
  // `items`, así que conservamos los del estado previo); si es nueva entra al
  // frente (createdAt desc, igual que el fetch).
  const reconcile = useCallback((incoming: any) => {
    if (!incoming || !incoming.id) return;
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === incoming.id);
      const isActive = ACTIVE_STATUSES.has(incoming.status);
      if (!isActive) {
        return idx >= 0 ? prev.filter((o) => o.id !== incoming.id) : prev;
      }
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...prev[idx], ...incoming };
        return next;
      }
      return [incoming, ...prev];
    });
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;
    // Carga inicial diferida a microtask (evita set-state sincrónico en effect).
    queueMicrotask(() => {
      if (!cancelled) refresh();
    });

    const { restaurantId, locationId } = getTenantIds();
    if (!restaurantId) {
      return () => {
        cancelled = true;
      };
    }

    // Mismo orden de búsqueda del token que api.ts / useNotifications: sin el
    // token en `auth`, el guard canJoinRestaurant deja al socket fuera de los
    // rooms y no llega ningún evento de orden.
    const token =
      sessionStorage.getItem("tpv-access-token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("tpv-employee-token");

    const socket = io(getApiUrl(), {
      query: { restaurantId },
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join:admin");
      if (locationId) socket.emit("join:location:admin", locationId);
      // Resync al (re)conectar: trae lo que se perdió mientras estuvo caído.
      if (!cancelled) refresh();
    });

    socket.on("order:new", reconcile);
    socket.on("order:updated", reconcile);
    socket.on("order:created", reconcile);

    return () => {
      cancelled = true;
      socket.off("order:new", reconcile);
      socket.off("order:updated", reconcile);
      socket.off("order:created", reconcile);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, refresh, reconcile]);

  return { orders, refresh };
}
