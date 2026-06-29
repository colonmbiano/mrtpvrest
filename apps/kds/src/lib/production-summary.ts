// Consolidado de producción: suma las cantidades PENDIENTES (no `done`) agrupadas
// por menuItemId. Los pedidos ya vienen de UNA estación (el endpoint
// /orders/:station filtra server-side), así que no se recibe la estación como
// parámetro. Se agrupa por id (NO por nombre, que fusionaría homónimos de
// distintos productos). `done` es todo-o-nada por orderItem.
//
// Combos: lo que la cocina arma son los COMPONENTES, no el contenedor del combo.
// Si un item trae comboSelections, se cuenta cada componente (por optionMenuItemId)
// en vez del combo. El nombre del componente se limpia del prefijo "Slot: ".
//
// Función pura (sin React) — testeada en production-summary.test.ts.

export type SummaryItem = { menuItemId: string; name: string; qtyPending: number };
type SummaryComboSel = { optionMenuItemId?: string; name?: string };
type SummaryInputItem = { menuItemId?: string; menuItemName?: string; quantity?: number; done?: boolean; comboSelections?: SummaryComboSel[] };
type SummaryInputOrder = { items?: SummaryInputItem[] };

function cleanComboName(name?: string): string {
  if (!name) return "Producto";
  const idx = name.indexOf(":");
  return idx >= 0 ? name.slice(idx + 1).trim() : name;
}

export function buildProductionSummary(orders: SummaryInputOrder[]): SummaryItem[] {
  const byId = new Map<string, SummaryItem>();
  const add = (key: string | undefined, name: string | undefined, qty: number) => {
    if (!key || !(qty > 0)) return;
    const cur = byId.get(key);
    if (cur) cur.qtyPending += qty;
    else byId.set(key, { menuItemId: key, name: name || "Producto", qtyPending: qty });
  };
  for (const o of orders || []) {
    for (const it of o.items || []) {
      if (it.done) continue;
      const qty = Number(it.quantity || 0);
      if (it.comboSelections && it.comboSelections.length) {
        for (const cs of it.comboSelections) add(cs.optionMenuItemId, cleanComboName(cs.name), qty);
      } else {
        add(it.menuItemId, it.menuItemName, qty);
      }
    }
  }
  return [...byId.values()].sort((a, b) => b.qtyPending - a.qtyPending);
}
