// Parser vía backend: llama POST /api/store/parse-order, que interpreta el
// texto con la Groq key BYOK del restaurante (server-side) reusando el mismo
// motor del dictado por voz del TPV. Es la ruta de IA preferida porque el
// bot/MCP NO maneja ninguna API key.
//
// Devuelve la misma forma que parseOrder: { items, unmatched }. Los items se
// enriquecen luego con label/precio del menú (en index.js).

const DEFAULT_API_BASE = process.env.WA_API_BASE || "https://api.mrtpvrest.com";

export async function backendParse(text, slug, apiBase = DEFAULT_API_BASE) {
  const url = `${apiBase}/api/store/parse-order?r=${encodeURIComponent(slug)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `parse-order HTTP ${res.status}`);
  const items = (Array.isArray(data.items) ? data.items : []).map((it) => ({
    menuItemId: it.menuItemId,
    variantId: it.variantId || null,
    quantity: Math.max(1, parseInt(it.quantity) || 1),
    label: it.name || null, // se completa con el menú en index.js
    confidence: "ia",
    notes: it.notes || undefined,
  }));
  const unmatched = Array.isArray(data.unmatched) ? data.unmatched : [];
  return { items, unmatched };
}
