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
import { llmParse } from "./llmParser.js";
import { createDraftOrder } from "./tpvClient.js";

export { fetchMenu, parseOrder, llmParse, createDraftOrder };

/**
 * @param {object} opts
 * @param {string} opts.slug
 * @param {string} opts.text                 mensaje del cliente
 * @param {object} [opts.customer]           { name, phone, address }
 * @param {"DELIVERY"|"TAKEOUT"|"DINE_IN"} [opts.orderType]
 * @param {boolean} [opts.dryRun=false]      true = solo parsea, no crea pedido
 * @param {function} [opts.llm]              parser de IA explícito (override)
 * @param {boolean|"auto"} [opts.useAi="auto"]  usar Groq si hay GROQ_API_KEY
 * @param {string} [opts.groqApiKey]
 * @param {string} [opts.apiBase]
 * @returns {Promise<{ parsed, unmatched, created, order, error, code, engine }>}
 */
export async function textToOrder(opts) {
  const { slug, text, customer = {}, orderType, dryRun = false, llm, apiBase } = opts;
  const useAi = opts.useAi === undefined ? "auto" : opts.useAi;
  const groqApiKey = opts.groqApiKey || process.env.GROQ_API_KEY;
  if (!slug) throw new Error("slug requerido");
  if (!text || !text.trim()) throw new Error("texto del pedido vacío");

  const menu = await fetchMenu(slug, apiBase);

  // Motor de parseo: IA (Groq) si está disponible/activada, con respaldo
  // automático al heurístico si la IA falla (sin key, timeout, JSON inválido).
  const aiFn = llm || (useAi !== false && groqApiKey
    ? (t, m) => llmParse(t, m, { apiKey: groqApiKey })
    : null);
  let parsed = [], unmatched = [], engine = "heurístico";
  if (aiFn) {
    try {
      const r = await parseOrder(text, menu, { llm: aiFn });
      parsed = r.items; unmatched = r.unmatched; engine = "ia";
    } catch (e) {
      const r = await parseOrder(text, menu); // respaldo
      parsed = r.items; unmatched = r.unmatched; engine = `heurístico (IA falló: ${e.message})`;
    }
  } else {
    const r = await parseOrder(text, menu);
    parsed = r.items; unmatched = r.unmatched;
  }
  const items = parsed;

  const result = { parsed: items, unmatched, created: false, order: null, engine };

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
