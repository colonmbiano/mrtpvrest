// Consolidado de producción: suma las cantidades PENDIENTES (no `done`) agrupadas
// por menuItemId + instrucciones. Los pedidos ya vienen de UNA estación (el endpoint
// /orders/:station filtra server-side), así que no se recibe la estación como
// parámetro. Se agrupa por id (NO por nombre, que fusionaría homónimos de
// distintos productos). `done` es todo-o-nada por orderItem.
//
// Combos: lo que la cocina arma son los COMPONENTES, no el contenedor del combo.
// Si un item trae comboSelections, se cuenta cada componente (por optionMenuItemId)
// en vez del combo. El nombre del componente se limpia del prefijo "Slot: ".
//
// Función pura (sin React) — testeada en production-summary.test.ts.

export type SummaryItem = { key: string; menuItemId: string; name: string; qtyPending: number; instructions: string[] };
type SummaryComboSel = { optionMenuItemId?: string; name?: string };
type SummaryInputItem = { menuItemId?: string; menuItemName?: string; quantity?: number; done?: boolean;
  notes?: string | null; modifiers?: Array<{ name?: string }>; comboSelections?: SummaryComboSel[] };
type SummaryInputOrder = { items?: SummaryInputItem[] };

function cleanComboName(name?: string): string {
  if (!name) return "Producto";
  const idx = name.indexOf(":");
  return idx >= 0 ? name.slice(idx + 1).trim() : name;
}

export function buildProductionSummary(orders: SummaryInputOrder[]): SummaryItem[] {
  const byId = new Map<string, SummaryItem>();
  const add = (menuItemId: string | undefined, name: string | undefined, qty: number, instructions: string[]) => {
    if (!menuItemId || !Number.isFinite(qty) || !(qty > 0)) return;
    const key = JSON.stringify([menuItemId, instructions]);
    const cur = byId.get(key);
    if (cur) cur.qtyPending += qty;
    else byId.set(key, { key, menuItemId, name: name || "Producto", qtyPending: qty, instructions });
  };
  for (const o of orders || []) {
    for (const it of o.items || []) {
      if (it.done) continue;
      const qty = Number(it.quantity || 0);
      // No convertir preferencias ni notas libres en alergias. Conservar
      // instrucciones distintas incluso si el producto tiene el mismo id.
      const instructions = [
        ...(it.modifiers || []).map((m) => m.name?.trim()).filter((name): name is string => !!name).sort(),
        ...(it.notes?.trim() ? [it.notes.trim()] : []),
      ];
      if (it.comboSelections && it.comboSelections.length) {
        for (const cs of it.comboSelections) add(cs.optionMenuItemId, cleanComboName(cs.name), qty, instructions);
      } else {
        add(it.menuItemId, it.menuItemName, qty, instructions);
      }
    }
  }
  return [...byId.values()].sort((a, b) => b.qtyPending - a.qtyPending);
}
