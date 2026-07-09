/* Tipos y constantes compartidos del dashboard Reportes IA.
   Los contratos de datos son los de la API — no cambiarlos sin tocar backend. */
import type { Tone } from "@/components/ds";

/* Períodos alineados con backend (getPeriodRange):
   - 90D reemplaza al antiguo "TRIM" (trimestre ~ 90 días)
   - AÑO ahora es rolling 365d (no año en curso)
   - HIST captura todo el histórico — clave para ver datos importados
     antiguos que no caen en los últimos 365 días. */
export type Period = "HOY" | "7D" | "30D" | "90D" | "AÑO" | "HIST";

export const PERIODS: readonly Period[] = ["HOY", "7D", "30D", "90D", "AÑO", "HIST"] as const;

export const PERIOD_LABEL: Record<Period, string> = {
  HOY: "Hoy",
  "7D": "Últimos 7 días",
  "30D": "Últimos 30 días",
  "90D": "Últimos 90 días",
  AÑO: "Últimos 365 días",
  HIST: "Histórico completo",
};

/* AÑO/HIST se acotan a 90 días para que la gráfica sea legible. */
export const PERIOD_DAYS: Record<Period, number> = {
  HOY: 1,
  "7D": 7,
  "30D": 30,
  "90D": 90,
  AÑO: 90,
  HIST: 90,
};

export type InsightVariant = "warn" | "ok" | "info";

/* Mapeo variante → tono semántico del ds (info usa el acento del tenant,
   como en el diseño original). */
export const INSIGHT_TONE: Record<InsightVariant, Tone> = {
  warn: "warn",
  ok: "ok",
  info: "ac",
};

export type Insight = {
  kind: string;
  variant: InsightVariant;
  title: string;
  body: string;
  cta: string;
};

export type StatsResponse = {
  sales: { value: number; prev: number; delta: number };
  orders: { value: number; prev: number; delta: number };
  averageTicket: { value: number; prev: number; delta: number };
  prepMinutes: { value: number; activeCount: number };
};

export type SedeRow = {
  id: string;
  name: string;
  slug: string;
  sales: number;
  orders: number;
  avgTicket: number;
  delta: number;
};

export type SavedReport = {
  id: string;
  title: string;
  tag: string;
  tagColor: string;
  tagBg: string;
  sub: string;
  active?: boolean;
};

export type SuggestedAction = { n: number; title: string; sub: string; cta: string; prompt: string };

export type TopItem = { id?: string; name: string; quantity: number; revenue: number };

export type DailyPoint = { date: string; revenue: number; orders: number };

export type SalesByDay = {
  days: number;
  series: DailyPoint[];
  totals: { current: { revenue: number; orders: number }; previous: { revenue: number; orders: number }; delta: number };
};

/* ── Chat ─────────────────────────────────────────────────────────── */
export type Msg = { role: "ai" | "user"; text: string; tools?: string[] };

export const INIT_MSGS: Msg[] = [
  {
    role: "ai",
    text: "Hola, soy Mesero. Puedo consultar ventas, productos top, inventario bajo y personal activo de tu sucursal activa. ¿Qué quieres saber?",
    tools: [],
  },
];

/* Chips de sugerencia del hero. */
export const CHIPS = [
  { icon: "↘", text: "Producto que más bajó", q: "¿Qué producto está bajando en ventas este mes?" },
  { icon: "↗", text: "Ticket promedio por sede", q: "Compara el ticket promedio entre sedes este mes" },
  { icon: "👤", text: "Ranking de meseros", q: "¿Qué empleado cerró más ventas este mes?" },
  { icon: "⏱", text: "Horas pico", q: "¿Cuáles son las horas pico por sede?" },
  { icon: "✦", text: "Predicción de ventas", q: "Predice las ventas del próximo fin de semana" },
  { icon: "⚠", text: "Mermas y margen", q: "¿Dónde estoy perdiendo margen por mermas?" },
] as const;
