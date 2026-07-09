// Tipos, helpers de stock y de unidades compartidos por /admin/inventario.
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from "lucide-react";
import type { Tone } from "@/components/ds";

export interface Supplier { id: string; name: string; phone?: string; }
export interface IngredientType { id: string; name: string; }
export interface IngredientCategory { id: string; name: string; color?: string | null; }
export interface Ingredient {
  id: string; name: string; unit: string; stock: number;
  minStock: number; cost: number; lowStock?: boolean;
  supplierId?: string; supplier?: Supplier;
  purchaseUnit?: string; purchaseCost?: number; conversionFactor?: number;
  // Nuevos campos del módulo costeo
  typeId?: string | null; type?: IngredientType | null;
  categoryId?: string | null; category?: IngredientCategory | null;
  baseUnit?: "GRAM" | "ML" | "PIECE";
  pesoBruto?: number | null; pesoNeto?: number | null;
  isPackaging?: boolean;
}
export interface Movement {
  id: string; createdAt: string; type: string; quantity: number;
  reason?: string; ingredient?: { name: string; unit: string; };
}
export interface SuggestionItem {
  ingredient: { id: string; name: string; stock: number; minStock: number; unit: string; baseUnit?: string; };
  supplier: { id: string; name: string; phone?: string; leadTimeDays?: number; minOrderAmount?: number; } | null;
  dailyAvgConsumption: number;
  daysOfStock: number | null;
  leadTimeDays: number;
  urgency: "URGENTE" | "PRONTO";
  qtySuggestedBase: number;
  qtySuggestedPurchase: number;
  purchaseUnit?: string;
  unitPrice: number;
  lineTotal: number;
}
export interface SuggestionGroup {
  supplier: SuggestionItem["supplier"];
  items: SuggestionItem[];
  urgentCount: number;
  totalAmount: number;
  belowMinOrder?: boolean;
}
export type FormState = {
  name: string; unit: string; stock: number | string; minStock: number | string;
  cost: number | string; supplierId: string;
  purchaseUnit: string; purchaseCost: number | string; conversionFactor: number | string;
  // Nuevos
  typeId: string; categoryId: string;
  baseUnit: "GRAM" | "ML" | "PIECE";
  pesoBruto: number | string; pesoNeto: number | string;
  isPackaging: boolean;
};
export type ScannedItem = { name: string; totalCost: number | string; quantityFound: number | string; unit: string; };

export const emptyForm: FormState = {
  name: "", unit: "pz", stock: 0, minStock: 0, cost: 0, supplierId: "",
  purchaseUnit: "", purchaseCost: "", conversionFactor: 1,
  typeId: "", categoryId: "", baseUnit: "PIECE",
  pesoBruto: "", pesoNeto: "", isPackaging: false,
};

export const UNITS = ["pz", "kg", "g", "l", "ml", "bolsa", "lata", "caja", "sobre", "rollo"];

// Conversión de la unidad de captura → unidad base del insumo (lo que guarda
// el stock). El insumo se compra en kg/L pero el inventario vive en g/ml; sin
// esto, teclear "100" sumaba 100 g en vez de 100 kg.
export const UNIT_FAMILIES = {
  GRAM: [{ value: "kg", label: "kg", factor: 1000 }, { value: "g", label: "g", factor: 1 }],
  ML: [{ value: "L", label: "L", factor: 1000 }, { value: "ml", label: "ml", factor: 1 }],
  PIECE: [{ value: "pz", label: "pz", factor: 1 }],
};
export const unitOptionsFor = (baseUnit?: string) =>
  UNIT_FAMILIES[(baseUnit as keyof typeof UNIT_FAMILIES)] ?? UNIT_FAMILIES.PIECE;
export const defaultUnitFor = (baseUnit?: string) => (baseUnit === "GRAM" ? "kg" : baseUnit === "ML" ? "L" : "pz");
export const baseUnitLabel = (baseUnit?: string) => (baseUnit === "GRAM" ? "g" : baseUnit === "ML" ? "ml" : "pz");
export const toBaseQty = (qty: number, unit: string, baseUnit?: string) => {
  const o = unitOptionsFor(baseUnit).find((u) => u.value === unit);
  return qty * (o?.factor ?? 1);
};

/* ── helpers de stock ──────────────────────────────────────────────── */
export type StockLevel = { tone: Tone; label: string; pct: number };
export function stockLevel(ing: Ingredient): StockLevel {
  const min = Number(ing.minStock) || 0;
  const stock = Number(ing.stock) || 0;
  // Referencia "lleno" = 2× el mínimo (heurística visual). Si no hay mínimo,
  // tratamos cualquier stock > 0 como suficiente.
  const target = min > 0 ? min * 2 : Math.max(stock, 1);
  const pct = Math.round((stock / target) * 100);
  if (min > 0 && stock <= min * 0.5) return { tone: "err", label: "Crítico", pct };
  if (ing.lowStock || (min > 0 && stock <= min)) return { tone: "warn", label: "Bajo", pct };
  return { tone: "ok", label: "Suficiente", pct };
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export type MovMeta = { label: string; icon: typeof ArrowDownToLine; tone: Tone };
export const MOV_META: Record<string, MovMeta> = {
  IN: { label: "Entrada", icon: ArrowDownToLine, tone: "ok" },
  OUT: { label: "Salida", icon: ArrowUpFromLine, tone: "err" },
  ADJUST: { label: "Ajuste", icon: SlidersHorizontal, tone: "info" },
};
export const movMeta = (type: string): MovMeta => MOV_META[type] ?? MOV_META.OUT!;
