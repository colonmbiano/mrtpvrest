import type { LucideIcon } from "lucide-react";
import { Calculator, Users, HandCoins, History, Settings } from "lucide-react";
import type { Tone } from "@/components/ds";
import { formatMoney } from "@/lib/format";

export const TZ = "America/Mexico_City";
export const mxToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

// Formateo con centavos (en nómina los centavos importan). formatMoney(es-MX,
// MXN, 2 decimales) equivale al Intl anterior.
export const mxn = (n: number) => formatMoney(Number(n) || 0, true);

export function addDays(yyyyMmDd: string, delta: number) {
  const [y = 0, m = 1, d = 1] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function fmtDate(iso?: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-MX", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

export const PAY_TYPES = [
  { value: "DAILY", label: "Por día" },
  { value: "HOURLY", label: "Por hora" },
  { value: "WEEKLY_FIXED", label: "Fijo" },
  { value: "PER_DELIVERY", label: "Por entrega" },
] as const;

export const PAY_TYPE_LABEL: Record<string, string> = { DAILY: "Por día", HOURLY: "Por hora", WEEKLY_FIXED: "Fijo", PER_DELIVERY: "Por entrega" };
export const RATE_FIELD: Record<string, string> = { DAILY: "dailyRate", HOURLY: "hourlyRate", WEEKLY_FIXED: "fixedAmount", PER_DELIVERY: "perDeliveryRate" };
export const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Borrador", tone: "warn" }, APPROVED: { label: "Aprobada", tone: "info" }, PAID: { label: "Pagada", tone: "ok" },
};
export const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", CASHIER: "Cajero", WAITER: "Mesero", DELIVERY: "Repartidor", COOK: "Cocinero" };
export const CHARGE_TYPE_LABEL: Record<string, string> = {
  CONSUMPTION: "Consumo", ADVANCE: "Anticipo", ADJUSTMENT: "Ajuste",
};

export type Tab = "raya" | "tarifas" | "cuentas" | "historial" | "ajustes";
export const TABS: { value: Tab; label: string; icon: LucideIcon }[] = [
  { value: "raya", label: "Calcular raya", icon: Calculator },
  { value: "tarifas", label: "Tarifas", icon: Users },
  { value: "cuentas", label: "Cuentas", icon: HandCoins },
  { value: "historial", label: "Historial", icon: History },
  { value: "ajustes", label: "Ajustes", icon: Settings },
];
