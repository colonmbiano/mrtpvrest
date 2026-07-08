/* Tipos y constantes compartidos por la home del admin. */

export type Period = "HOY" | "7D" | "30D";

export type Stats = {
  sales: { value: number; delta: number };
  orders: { value: number; delta: number };
  averageTicket: { value: number; delta: number };
  prepMinutes: { value: number; activeCount: number };
};

export type SalesDay = { date: string; revenue: number; orders: number };
export type TopItem = { name: string; quantity: number; revenue: number };
export type ActiveShift = { staff: Array<{ id: string; name: string; role: string }> };

export const PERIOD_LABELS: Record<Period, string> = { HOY: "Hoy", "7D": "7 días", "30D": "30 días" };
export const PERIOD_DAYS: Record<Period, number> = { HOY: 1, "7D": 7, "30D": 30 };

export const PERIOD_OPTIONS = (Object.keys(PERIOD_LABELS) as Period[]).map((value) => ({
  value,
  label: PERIOD_LABELS[value],
}));
