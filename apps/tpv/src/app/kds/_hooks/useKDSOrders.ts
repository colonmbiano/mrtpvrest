"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { playKDSAlert } from "../_lib/kds";

const POLL_INTERVAL_MS = 12000;

type KDSItem = {
  id: string;
  name?: string;
  menuItem?: { name?: string };
  quantity: number;
  notes?: string | null;
  done: boolean;
};

export type KDSOrder = {
  id: string;
  orderNumber: string;
  orderType: string;
  tableNumber?: string | number | null;
  customerName?: string | null;
  createdAt: string;
  waitMinutes: number;
  allDone?: boolean;
  items: KDSItem[];
};

export function useKDSOrders(station: string, enabled: boolean) {
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const prevIds = useRef<string[]>([]);

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get<KDSOrder[]>(`/api/kds/orders/${station}`);
      const newIds = data.map((o) => o.id);
      if (prevIds.current.length > 0 && newIds.some((id) => !prevIds.current.includes(id))) {
        playKDSAlert();
      }
      prevIds.current = newIds;
      setOrders(data);
    } catch {} finally {
      setLoading(false);
    }
  }, [station]);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    fetchOrders();
    const t = setInterval(fetchOrders, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [enabled, fetchOrders]);

  const toggleItem = useCallback(async (orderId: string, itemId: string, done: boolean) => {
    try {
      await api.put(`/api/kds/item/${itemId}/done`, { station, orderId, done: !done });
      setOrders((prev) => prev.map((order) => {
        if (order.id !== orderId) return order;
        const items = order.items.map((i) =>
          i.id === itemId ? { ...i, done: !done } : i
        );
        return { ...order, items, allDone: items.every((i) => i.done) };
      }));
    } catch {}
  }, [station]);

  const markReady = useCallback(async (orderId: string) => {
    try {
      await api.put(`/api/kds/order/${orderId}/ready`);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch {}
  }, []);

  return { orders, loading, fetchOrders, toggleItem, markReady };
}
