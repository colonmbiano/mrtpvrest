// Cliente del TPV: crea el pedido como BORRADOR en el backend usando el mismo
// endpoint público que la tienda en línea (POST /api/store/orders), con
// source=WHATSAPP. El pedido nace PENDING y aparece en el panel "Pedidos Web"
// del TPV, donde el cajero lo confirma antes de mandarlo a cocina.
//
// El backend recalcula precios desde la BD — aquí solo mandamos ids + cantidad.

const DEFAULT_API_BASE = process.env.WA_API_BASE || "https://api.mrtpvrest.com";

/**
 * @param {object} opts
 * @param {string} opts.slug          slug de la tienda (p.ej. "master-burguer-s")
 * @param {Array}  opts.items         [{ menuItemId, variantId?, quantity, notes? }]
 * @param {string} opts.customerName
 * @param {string} [opts.customerPhone]
 * @param {"DELIVERY"|"TAKEOUT"|"DINE_IN"} [opts.orderType="TAKEOUT"]
 * @param {string} [opts.deliveryAddress]  requerido si orderType=DELIVERY
 * @param {string} [opts.notes]
 * @param {string} [opts.apiBase]
 * @returns {Promise<{ ok: boolean, order?: any, error?: string, code?: string }>}
 */
export async function createDraftOrder(opts) {
  const apiBase = opts.apiBase || DEFAULT_API_BASE;
  const orderType = opts.orderType || "TAKEOUT";
  const body = {
    source: "WHATSAPP",
    orderType,
    customerName: opts.customerName || "Cliente WhatsApp",
    customerPhone: opts.customerPhone || null,
    deliveryAddress: orderType === "DELIVERY" ? opts.deliveryAddress || null : null,
    notes: opts.notes || null,
    items: (opts.items || []).map((i) => ({
      menuItemId: i.menuItemId,
      variantId: i.variantId || undefined,
      quantity: i.quantity || 1,
      notes: i.notes || undefined,
      modifierIds: i.modifierIds || undefined,
    })),
  };

  const url = `${apiBase}/api/store/orders?r=${encodeURIComponent(opts.slug)}`;
  let res, data;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    return { ok: false, error: `Red: ${e.message}` };
  }
  if (!res.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, code: data?.code };
  }
  return { ok: true, order: data };
}
