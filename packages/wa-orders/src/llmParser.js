// Parser de IA (Groq, Llama) — FASE 1.
//
// Convierte texto libre de WhatsApp en items del menú usando un LLM, que es
// mucho más robusto que el heurístico para mensajes reales ("unas alitas para
// 4 con bbq y otra de mango, y 2 cocas"). Devuelve EXACTAMENTE la misma forma
// que parseOrder, así que se inyecta vía `opts.llm` sin tocar nada más; si
// falla (sin API key, timeout, etc.) el caller cae al heurístico.
//
// El modelo NO inventa precios ni ids: se le da el menú como lista indexada y
// solo elige índices + cantidad. Luego mapeamos el índice a {menuItemId,
// variantId} reales. Esto evita alucinaciones de ids.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = process.env.WA_GROQ_MODEL || "llama-3.3-70b-versatile";

function buildPrompt(units) {
  // Lista indexada y compacta del menú (índice, etiqueta, precio).
  const lines = units.map((u, i) => `${i}\t${u.label}\t$${u.price}`);
  return [
    "Eres el tomador de pedidos de un restaurante. Te doy el MENÚ (con índice,",
    "nombre y precio) y el MENSAJE de un cliente por WhatsApp. Extrae SOLO los",
    "productos del menú que el cliente está pidiendo.",
    "",
    "Reglas:",
    "- Usa únicamente índices que existan en el menú. No inventes.",
    "- Si el cliente da cantidad, respétala; si no, usa 1.",
    "- Elige la variante/sabor más parecido (ej. 'bbq', 'hawaiana').",
    "- Ignora saludos y texto que no sea un producto.",
    "- Lo que parezca un pedido pero no exista en el menú, ponlo en 'unmatched'.",
    "",
    "Responde SOLO JSON con esta forma exacta:",
    '{"items":[{"idx":<número>,"quantity":<número>,"note":"<texto u omitir>"}],"unmatched":["<texto>"]}',
    "",
    "MENÚ (índice\\tnombre\\tprecio):",
    lines.join("\n"),
  ].join("\n");
}

/**
 * @param {string} text
 * @param {{units: Array}} menu
 * @param {{ apiKey?: string, model?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<{items: Array, unmatched: string[]}>}
 */
export async function llmParse(text, menu, opts = {}) {
  const apiKey = opts.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY no configurada");
  const units = menu.units || [];
  const model = opts.model || DEFAULT_MODEL;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || 15000);
  let res, data;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildPrompt(units) },
          { role: "user", content: `MENSAJE: ${text}` },
        ],
      }),
    });
    data = await res.json();
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) throw new Error(`Groq ${res.status}: ${data?.error?.message || "error"}`);

  let parsed;
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  } catch {
    throw new Error("Respuesta de IA no es JSON válido");
  }

  const items = [];
  for (const it of parsed.items || []) {
    const u = units[it.idx];
    if (!u) continue;
    items.push({
      menuItemId: u.menuItemId,
      variantId: u.variantId,
      label: u.label,
      price: u.price,
      quantity: Math.max(1, Math.min(50, parseInt(it.quantity) || 1)),
      notes: typeof it.note === "string" && it.note.trim() ? it.note.trim() : undefined,
      confidence: "ia",
      raw: text,
    });
  }
  const unmatched = Array.isArray(parsed.unmatched)
    ? parsed.unmatched.filter((s) => typeof s === "string" && s.trim())
    : [];
  return { items, unmatched };
}
