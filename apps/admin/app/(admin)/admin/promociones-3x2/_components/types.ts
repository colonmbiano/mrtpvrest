export interface Category {
  id: string;
  name: string;
  isActive?: boolean;
}

export interface PromoCategory {
  id: string;
  name: string | null;
}

export interface BulkPromo {
  id: string;
  name: string;
  buyQuantity: number;
  payQuantity: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  startTime: string | null;
  endTime: string | null;
  categories: PromoCategory[];
}

// Forma del formulario (crear / editar).
export interface FormState {
  id: string | null;
  name: string;
  buyQuantity: number;
  payQuantity: number;
  isActive: boolean;
  startsAt: string; // yyyy-mm-dd o ""
  endsAt: string;
  startTime: string; // HH:mm o "" (hora local, sin límite)
  endTime: string;
  categoryIds: string[];
}

export const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  buyQuantity: 3,
  payQuantity: 2,
  isActive: true,
  startsAt: "",
  endsAt: "",
  startTime: "",
  endTime: "",
  categoryIds: [],
};

// Presets rápidos de NxM.
export const PRESETS: { label: string; buy: number; pay: number }[] = [
  { label: "3x2", buy: 3, pay: 2 },
  { label: "2x1", buy: 2, pay: 1 },
  { label: "4x3", buy: 4, pay: 3 },
];

// Recorta una fecha ISO a yyyy-mm-dd para <input type=date>.
export function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

// Etiqueta legible de la ventana horaria diaria ("hasta 21:00", "16:00–21:00").
export function timeWindowLabel(p: { startTime: string | null; endTime: string | null }): string | null {
  if (p.startTime && p.endTime) return `${p.startTime}–${p.endTime}`;
  if (p.endTime) return `hasta ${p.endTime}`;
  if (p.startTime) return `desde ${p.startTime}`;
  return null;
}
