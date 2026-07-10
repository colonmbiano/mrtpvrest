// Tipos y estilos compartidos por las piezas de /admin/inventario/compras.

export interface LocationRow { id: string; name: string; isCentralWarehouse?: boolean; }
export interface Supplier { id: string; name: string; }
export interface LookupIngredient { id: string; name: string; unit?: string; baseUnit?: string; }
export interface PurchaseLine { ingredientId: string; qty: string; unitPrice: string; }
export interface PurchaseOrder {
  id: string; poNumber: string; totalAmount: number; paymentMethod: string;
  receivedAt: string; createdAt: string;
  supplier?: { name: string }; location?: { name: string };
  createdBy?: { name: string };
  items?: { qtyReceived: number; unitPrice: number; ingredient?: { name: string } }[];
}
export interface WarehouseRow {
  id: string; name: string; unit: string; stock: number; minStock: number;
  cost: number; value: number; lowStock: boolean; category?: { name: string } | null;
}
export interface WarehouseResp {
  location: { id: string; name: string }; totalValue: number; count: number; ingredients: WarehouseRow[];
}
export interface SuggestionRow {
  centralIngredientId: string; name: string; unit: string;
  destStock: number; destMinStock: number; centralStock: number;
  suggestedQty: number; estimatedCost: number;
}
export interface TransferRow {
  id: string; createdAt: string; totalCost: number; notes?: string;
  fromLocation?: { name: string }; createdBy?: { name: string };
  items?: { qty: number; ingredient?: { name: string }; toLocation?: { name: string } }[];
}
export interface ScanRow { name: string; totalCost: number | string; quantityFound: number | string; matchedId: string; }

export type TabKey = "compra" | "historial" | "bodega" | "reparto";

export const PAYMENT_METHODS = [
  { value: "CASH_DRAWER", label: "Efectivo de caja" },
  // Efectivo acumulado (bóveda): la compra sube stock pero no toca el corte
  // del turno. Es el caso de comprar insumos en una tienda cualquier día.
  { value: "CASH_VAULT", label: "Efectivo acumulado" },
  { value: "CORPORATE_CARD", label: "Tarjeta corporativa" },
  { value: "TRANSFER", label: "Transferencia" },
];

export const norm = (s: string) => s.trim().toLowerCase();

export const inputCls = "min-h-11 w-full rounded-ds-md px-3 text-sm text-tx outline-none transition-colors focus:border-primary";
export const inputStyle = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;
export const cellCls = "rounded-lg px-3 py-2 text-sm text-tx outline-none transition-colors focus:border-primary";
export const cellStyle = { background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;
