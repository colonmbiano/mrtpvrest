/**
 * useWaiterRealtime.ts — socket.io para las pantallas de meseros.
 *
 * Misma conexión/handshake que useNotifications (token del vault en `auth`,
 * rooms de admins de la sucursal vía join:admin / join:location:admin), pero
 * sin tocar la bandeja de notificaciones del TPV: el consumidor solo recibe
 * callbacks para refrescar la sala y avisar "orden lista".
 *
 * El polling existente se conserva como fallback (el socket puede caerse en
 * redes de restaurante); este hook solo acelera el refresco a tiempo real.
 */
"use client";
import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { getApiUrl } from "@/lib/config";
import { getTenantIds } from "@/lib/tenant";
import { getToken } from "@/lib/token-vault";

export function useWaiterRealtime(opts: {
  /** Algo cambió en órdenes/mesas de la sucursal — refresca tu vista. */
  onChange?: () => void;
  /** Una orden pasó a READY (cocina terminó). */
  onOrderReady?: (order: any) => void;
}) {
  const socketRef = useRef<Socket | null>(null);

  // Callbacks en refs para no re-suscribir el socket en cada render. Se
  // refrescan en un effect (escribir el ref durante el render viola
  // react-hooks y rompe el lint del CI).
  const onChangeRef = useRef(opts.onChange);
  const onOrderReadyRef = useRef(opts.onOrderReady);
  useEffect(() => {
    onChangeRef.current = opts.onChange;
    onOrderReadyRef.current = opts.onOrderReady;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const { restaurantId, locationId } = getTenantIds();
    if (!restaurantId) return;

    let cancelled = false;

    void (async () => {
      // El guard canJoinRestaurant del backend exige token en el handshake;
      // sin él el socket no entra a ningún room (ver useNotifications).
      const token = await getToken();
      if (cancelled) return;

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
      });

      const notifyChange = () => {
        try { onChangeRef.current?.(); } catch { /* noop */ }
      };

      socket.on("order:new", notifyChange);
      socket.on("order:payment:confirmed", notifyChange);
      socket.on("order:updated", (order: any) => {
        if (order?.status === "READY") {
          try { onOrderReadyRef.current?.(order); } catch { /* noop */ }
        }
        notifyChange();
      });
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);
}
