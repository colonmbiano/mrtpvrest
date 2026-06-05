// nlu.js — Comprensión de lenguaje natural OPCIONAL para el chatbot.
//
// Cuando el cliente escribe en lenguaje libre (ej. "quiero 2 hamburguesas y un
// refresco") en vez de usar los números del menú, intentamos mapear su mensaje
// a productos del menú con Groq (Llama 3.1). Es best-effort: ante cualquier
// fallo o falta de API key devuelve [] y el flujo numerado determinista sigue
// funcionando. Se activa con WHATSAPP_NLU_ENABLED=true.

const OpenAI = require('openai');
const { resolveGroqKey } = require('../ai-key.service');
const { GROQ_BASE_URL, GROQ_MODEL } = require('../groq-error');

/**
 * @param {{ restaurantId:string, text:string, menu:Array }} args
 * @returns {Promise<Array<{menuItemId,variantId,name,unitPrice,quantity}>>}
 */
async function parseOrderText({ restaurantId, text, menu }) {
  const lines = [];
  for (const cat of menu || []) for (const l of cat.lines || []) lines.push(l);
  if (lines.length === 0 || !String(text || '').trim()) return [];

  let apiKey;
  try {
    ({ apiKey } = await resolveGroqKey({ restaurantId }));
  } catch {
    return []; // sin key disponible → no-op
  }

  const client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  const menuList = lines.map((l, i) => `${i}: ${l.name} ($${l.unitPrice})`).join('\n');
  const userPrompt =
    `Menú disponible (índice: producto):\n${menuList}\n\n` +
    `Mensaje del cliente: "${text}"\n\n` +
    `Devuelve SOLO JSON con la forma {"items":[{"index":<número>,"quantity":<número>}]} ` +
    `incluyendo únicamente productos del menú que el cliente pide. Si no menciona ` +
    `ninguno, devuelve {"items":[]}.`;

  let content;
  try {
    const resp = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'Eres un parser de pedidos de restaurante. Respondes solo con JSON válido.' },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });
    content = resp.choices?.[0]?.message?.content || '{}';
  } catch {
    return [];
  }

  let parsed;
  try { parsed = JSON.parse(content); } catch { return []; }

  const out = [];
  for (const it of parsed.items || []) {
    const idx = Number(it.index);
    const line = Number.isInteger(idx) ? lines[idx] : null;
    if (!line) continue;
    const quantity = Math.max(1, Math.min(50, parseInt(it.quantity, 10) || 1));
    out.push({
      menuItemId: line.menuItemId,
      variantId: line.variantId,
      name: line.name,
      unitPrice: line.unitPrice,
      quantity,
    });
  }
  return out;
}

module.exports = { parseOrderText };
