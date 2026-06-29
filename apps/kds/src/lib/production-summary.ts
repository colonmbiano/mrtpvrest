// Consolidado de producción: suma las cantidades PENDIENTES (no `done`) agrupadas
// por menuItemId. Los pedidos ya vienen de UNA estación (el endpoint
// /orders/:station filtra server-side), así que no se recibe la estación como
// parámetro. Se agrupa por id (NO por nombre, que fusionaría homónimos de
// distintos productos). `done` es todo-o-nada por orderItem.
//
// Función pura (sin React) para poder testearla aislada cuando se agregue jest
// al app KDS (hoy no tiene runner — follow-up documentado).

export type SummaryItem = { menuItemId: string; name: string; qtyPending: number };
type SummaryInputItem = { menuItemId?: string; menuItemName?: string; quantity?: number; done?: boolean };
type SummaryInputOrder = { items?: SummaryInputItem[] };

export function buildProductionSummary(orders: SummaryInputOrder[]): SummaryItem[] {
  const byId = new Map<string, SummaryItem>();
  for (const o of orders || []) {
    for (const it of o.items || []) {
      if (it.done) continue;
      const id = it.menuItemId;
      if (!id) continue;
      const qty = Number(it.quantity || 0);
      const cur = byId.get(id);
      if (cur) cur.qtyPending += qty;
      else byId.set(id, { menuItemId: id, name: it.menuItemName || "Producto", qtyPending: qty });
    }
  }
  return [...byId.values()].sort((a, b) => b.qtyPending - a.qtyPending);
}
