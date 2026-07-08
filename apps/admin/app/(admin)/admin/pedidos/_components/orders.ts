/* Modelo de estados y tipos compartidos de la pantalla de Pedidos. */
import {
  Inbox, CheckCircle2, ChefHat, BellRing, Bike, Home, Package,
} from "lucide-react";
import type { Tone } from "@/components/ds";

export type StatusKey =
  | "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "PACKING"
  | "ON_THE_WAY" | "DELIVERED" | "CANCELLED";

export const STATUSES: { key: StatusKey; label: string; icon: typeof Inbox; tone: Tone }[] = [
  { key: "PENDING",    label: "Pendientes",  icon: Inbox,        tone: "warn" },
  { key: "CONFIRMED",  label: "Confirmados", icon: CheckCircle2, tone: "info" },
  { key: "PREPARING",  label: "Preparando",  icon: ChefHat,      tone: "ac"   },
  { key: "READY",      label: "Listos",      icon: BellRing,     tone: "info" },
  { key: "PACKING",    label: "En empaque",  icon: Package,      tone: "ac"   },
  { key: "ON_THE_WAY", label: "En camino",   icon: Bike,         tone: "ac"   },
  { key: "DELIVERED",  label: "Entregados",  icon: Home,         tone: "ok"   },
];

export const STATUS_META: Record<string, { label: string; icon: typeof Inbox; tone: Tone }> =
  Object.fromEntries(STATUSES.map((s) => [s.key, s]));

// Avance por defecto. READY → ON_THE_WAY se mantiene (la mayoría no usa empaque);
// PACKING (cuando el tenant lo activa) avanza a ON_THE_WAY.
export const NEXT_STATUS: Record<string, StatusKey> = {
  PENDING: "CONFIRMED", CONFIRMED: "PREPARING",
  PREPARING: "READY", READY: "ON_THE_WAY", PACKING: "ON_THE_WAY", ON_THE_WAY: "DELIVERED",
};

export const SOURCE_LABELS: Record<string, string> = {
  ONLINE: "Online", TPV: "TPV", WAITER: "Mesero",
};

export interface OrderItem { id: string; name: string; quantity: number; price: number; notes?: string }

export interface Order {
  id: string; orderNumber: string; status: StatusKey;
  customerName?: string; customerPhone?: string; user?: { name?: string };
  total?: number; source?: string; orderType?: string; paymentMethod?: string;
  paymentStatus?: string; cashCollected?: boolean;
  createdAt: string; updatedAt: string;
  items?: OrderItem[]; deliveryAddress?: string; notes?: string;
  deliveryDriverId?: string;
}

export interface Driver { id: string; name: string; phone?: string }

export function timeAgo(date: string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return "ahora";
  if (diff < 60) return `${diff}m`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}
