/* Tipos compartidos por las pestañas de la página WhatsApp. */

export type Tab = "asistente" | "reportes" | "contactos" | "campanas" | "juegos";

export type Contact = {
  id: string;
  phone: string;
  name: string | null;
  optIn: boolean;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  lastContactedAt: string | null;
};

export type Prize = {
  label: string;
  type: "PERCENTAGE" | "FIXED" | "NONE";
  value: number;
  weight: number;
  minOrderAmount: number;
  expiresInDays: number;
};

export type Game = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: "ON_COMMAND" | "ON_ORDER";
  prizes: Prize[];
  maxPerContact: number;
};

export type Report = {
  whatsapp: { totalRevenue: number; totalOrders: number; averageTicket: number; deliveryFees: number };
  byLocation: { locationId: string | null; locationName: string; revenue: number; orders: number; deliveryFees: number }[];
  bySource: { source: string; revenue: number; orders: number }[];
};

// ── Bot asistente (Cajero Estrella) ──────────────────────────────────────────
export type AssistantConfig = { extraInstructions: string; ignoreNumbers: string[]; ignoreGroupName: string };
export type AssistantState = {
  configured: boolean;
  enabled: boolean;
  // Entitlement del add-on (plan): en rollout suave el backend devuelve true.
  entitled?: boolean;
  provisioned: boolean;
  phoneNumber: string | null;
  updatedAt: string | null;
  config: AssistantConfig;
};
export type BotMetrics = {
  bot: { total: number; last24h: number; last7d: number; revenue: number; avgTicket: number; lastOrderAt: string | null };
} | null;
export type BotStatus = {
  reachable: boolean;
  ready: boolean | null;
  hasQr: boolean | null;
  qrUrl: string | null;
  url: string | null;
  provisioned?: boolean;
  error?: string;
};

export const SEGMENT_LABELS: Record<string, string> = {
  ALL: "Todos los clientes",
  INACTIVE: "Inactivos (+30 días)",
  RECENT: "Recientes (7 días)",
  FREQUENT: "Frecuentes (3+ pedidos)",
};

export const emptyPrize = (): Prize => ({
  label: "",
  type: "PERCENTAGE",
  value: 10,
  weight: 1,
  minOrderAmount: 0,
  expiresInDays: 7,
});
export const emptyGame = (): Game => ({
  id: "",
  name: "",
  enabled: true,
  trigger: "ON_COMMAND",
  maxPerContact: 1,
  prizes: [emptyPrize()],
});

export const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" }) : "—";
