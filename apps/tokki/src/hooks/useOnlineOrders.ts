"use client";

import { useCallback, useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import api from "@/lib/api";
import { getApiUrl } from "@/lib/config";
import { getTenantIds } from "@/lib/tenant";
import { getToken } from "@/lib/token-vault";
import { isOnlineOrder, orderItemsToTicketItems, orderTypeName, shouldAutoPrintOrder, type OnlineOrder } from "@/lib/online-orders";
import type { PrinterRecord } from "@/lib/printer-tcp";
import { printTokkiOrder } from "@/lib/tokki-printers";

const LAST_SEEN_KEY = "tokki-online-orders-last-seen";
const FIRST_START_LOOKBACK_MS = 15 * 60 * 1000;
const MAX_CATCHUP_MS = 30 * 60 * 1000;

function notifyOrdersChanged() {
  window.dispatchEvent(new Event("tokki-orders-changed"));
}

function playIncomingSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.22);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // El aviso visual sigue funcionando si Android bloquea audio en segundo plano.
  }
}

export function useOnlineOrders({ printers, enabled, soundEnabled }: { printers: PrinterRecord[]; enabled: boolean; soundEnabled: boolean }) {
  const socketRef = useRef<Socket | null>(null);
  const printersRef = useRef(printers);
  const soundRef = useRef(soundEnabled);
  const processingRef = useRef(new Set<string>());
  const printedRef = useRef(new Set<string>());
  const notifiedRef = useRef(new Set<string>());
  const catchupRunningRef = useRef(false);

  useEffect(() => { printersRef.current = printers; }, [printers]);
  useEffect(() => { soundRef.current = soundEnabled; }, [soundEnabled]);

  const processOrder = useCallback(async (signal: Partial<OnlineOrder>, reason: "new" | "paid" | "catchup") => {
    const id = signal.id || (signal as { orderId?: string }).orderId;
    if (!id || processingRef.current.has(id) || printedRef.current.has(id)) return;
    processingRef.current.add(id);
    try {
      const { data: order } = await api.get<OnlineOrder>(`/api/orders/${id}`, { timeout: 12000 });
      if (!isOnlineOrder(order)) return;
      notifyOrdersChanged();

      const notificationKey = `${id}:${String(order.paymentStatus || "PENDING").toUpperCase()}`;
      if (!notifiedRef.current.has(notificationKey)) {
        notifiedRef.current.add(notificationKey);
        const folio = order.orderNumber ? `#${order.orderNumber}` : `#${id.slice(-6).toUpperCase()}`;
        const paid = String(order.paymentStatus || "").toUpperCase() === "PAID";
        toast(paid && reason === "paid" ? "💳 Pago en línea confirmado" : "🛍️ Pedido en línea recibido", {
          description: `${folio} · ${order.customerName || "Cliente"} · ${orderTypeName(order.orderType)} · $${Number(order.total || 0).toFixed(2)}`,
          duration: 12000,
        });
        if (soundRef.current) playIncomingSound();
      }

      if (!shouldAutoPrintOrder(order)) return;
      const items = orderItemsToTicketItems(order.items);
      if (!items.length) return;

      let mayPrint = true;
      let ownsPrintClaim = false;
      try {
        const { data: claim } = await api.post<{ claimed?: boolean }>(`/api/orders/${id}/claim-kitchen-print`, undefined, { timeout: 8000 });
        mayPrint = claim?.claimed !== false;
        ownsPrintClaim = mayPrint;
      } catch {
        // Fail-open: el coordinador no debe hacer que se pierda una comanda.
      }
      if (!mayPrint) {
        printedRef.current.add(id);
        return;
      }

      try {
        await printTokkiOrder(printersRef.current, {
          orderNumber: order.orderNumber || id.slice(-6).toUpperCase(),
          orderType: order.orderType || null,
          tableNumber: order.table?.name || (order.tableNumber != null ? String(order.tableNumber) : null),
          customerName: order.customerName || order.user?.name || null,
          items,
          paid: String(order.paymentStatus || "").toUpperCase() === "PAID",
          paymentMethod: order.paymentMethod || null,
        });
        printedRef.current.add(id);
        toast.success(`🖨️ Pedido #${order.orderNumber || id.slice(-6).toUpperCase()} impreso`);
      } catch (cause) {
        if (ownsPrintClaim) {
          await api.post(`/api/orders/${id}/release-kitchen-print`, undefined, { timeout: 5000 }).catch(() => {});
        }
        toast.warning(`Pedido recibido, pero no se imprimió: ${cause instanceof Error ? cause.message : "revisa la impresora"}`, { duration: 15000 });
      }
    } catch (cause) {
      if (reason !== "catchup") console.error("No se pudo procesar el pedido en línea", cause);
    } finally {
      processingRef.current.delete(id);
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
    }
  }, []);

  const catchUp = useCallback(async () => {
    if (catchupRunningRef.current) return;
    catchupRunningRef.current = true;
    try {
      const now = Date.now();
      const stored = Number(localStorage.getItem(LAST_SEEN_KEY));
      const fallback = now - FIRST_START_LOOKBACK_MS;
      const since = Math.max(Number.isFinite(stored) && stored > 0 ? stored : fallback, now - MAX_CATCHUP_MS);
      const { data } = await api.get<OnlineOrder[]>("/api/orders/open-tokki?onlineOnly=1", { timeout: 12000 });
      const recent = (Array.isArray(data) ? data : []).filter((order) => {
        const changedAt = Date.parse(order.updatedAt || order.createdAt || "");
        return Number.isFinite(changedAt) && changedAt >= since;
      });
      await Promise.all(recent.map((order) => processOrder(order, "catchup")));
      localStorage.setItem(LAST_SEEN_KEY, String(now));
      notifyOrdersChanged();
    } catch {
      // El socket o el próximo sondeo volverán a intentar cuando regrese la red.
    } finally {
      catchupRunningRef.current = false;
    }
  }, [processOrder]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const { restaurantId, locationId } = getTenantIds();
    if (!restaurantId || !locationId) return;
    let cancelled = false;

    void (async () => {
      const token = await getToken();
      if (cancelled || !token) return;
      const socket = io(getApiUrl(), {
        query: { restaurantId },
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
      });
      socketRef.current = socket;
      socket.on("connect", () => {
        socket.emit("join:admin");
        socket.emit("join:location:admin", locationId);
        void catchUp();
      });
      socket.on("order:new", (order) => void processOrder(order, "new"));
      socket.on("new:order", (order) => void processOrder(order, "new"));
      socket.on("order:paid", (order) => void processOrder(order, "paid"));
      socket.on("order:payment:confirmed", (order) => void processOrder(order, "paid"));
      socket.on("order:updated", notifyOrdersChanged);
    })();

    const online = () => void catchUp();
    window.addEventListener("online", online);
    const interval = window.setInterval(() => void catchUp(), 30000);
    return () => {
      cancelled = true;
      window.removeEventListener("online", online);
      window.clearInterval(interval);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [catchUp, enabled, processOrder]);
}
