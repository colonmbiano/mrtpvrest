// Orquestador del núcleo wa-orders: texto → pedido en el TPV.
//
//   textToOrder({ slug, text, customer })
//     1) trae el menú de la tienda
//     2) parsea el texto a items (heurístico o IA inyectada)
//     3) si hay items, crea el borrador en el TPV (source=WHATSAPP, PENDING)
//
// Lo consumen el bot (apps/wa-bridge) y el servidor MCP (apps/wa-mcp). En modo
// `dryRun` no crea nada: solo devuelve el parseo (útil para previsualizar).

import { fetchMenu } from "./menu.js";
import { parseOrder } from "./parser.js";
import { createDraftOrder } from "./tpvClient.js";

export { fetchMenu, parseOrder, createDraftOrder };

/**
 * @param {object} opts
 * @param {string} opts.slug
 * @param {string} opts.text                 mensaje del cliente
 * @param {object} [opts.customer]           { name, phone, address }
 * @param {"DELIVERY"|"TAKEOUT"|"DINE_IN"} [opts.orderType]
 * @param {boolean} [opts.dryRun=false]      true = solo parsea, no crea pedido
 * @param {function} [opts.llm]              parser de IA opcional (Fase 1)
 * @param {string} [opts.apiBase]
 * @returns {Promise<{ parsed, unmatched, created, order, error, code }>}
 */
export async function textToOrder(opts) {
  const { slug, text, customer = {}, orderType, dryRun = false, llm, apiBase } = opts;
  if (!slug) throw new Error("slug requerido");
  if (!text || !text.trim()) throw new Error("texto del pedido vacío");

  const menu = await fetchMenu(slug, apiBase);
  const { items, unmatched } = await parseOrder(text, menu, { llm });

  const result = { parsed: items, unmatched, created: false, order: null };

  if (items.length === 0) {
    result.error = "No se reconoció ningún producto del menú en el mensaje.";
    return result;
  }
  if (dryRun) return result;

  const resolvedType =
    orderType || (customer.address ? "DELIVERY" : "TAKEOUT");
  const r = await createDraftOrder({
    slug,
    apiBase,
    items,
    customerName: customer.name || "Cliente WhatsApp",
    customerPhone: customer.phone || null,
    orderType: resolvedType,
    deliveryAddress: customer.address || null,
    notes: "Pedido recibido por WhatsApp (pendiente de confirmar).",
  });

  if (!r.ok) {
    result.error = r.error;
    result.code = r.code;
    return result;
  }
  result.created = true;
  result.order = r.order;
  return result;
}
