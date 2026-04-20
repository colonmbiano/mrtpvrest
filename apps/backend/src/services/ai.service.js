const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Servicio de IA consolidado para Menú e Inventario.
 * La apiKey se resuelve por request (BYOK) vía resolveAiKey({ restaurantId }).
 */
function getGeminiModel(apiKey, json = false) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    ...(json && { generationConfig: { responseMimeType: "application/json" } }),
  });
}

/**
 * Escanea imágenes de un MENÚ
 */
async function scanMenuFromImages(base64Images, apiKey) {
  try {
    const model = getGeminiModel(apiKey);
    const prompt = `Analiza estas imágenes de un menú de restaurante. Extrae platos, precios, descripciones y categorías. Devuelve un JSON: { "categories": [], "items": [{ "name": "", "price": 0, "description": "", "category": "" }] }. Solo JSON puro.`;
    const imageParts = base64Images.map(base64 => ({ inlineData: { data: base64, mimeType: "image/jpeg" } }));
    const result = await model.generateContent([prompt, ...imageParts]);
    const text = result.response.text();
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (error) {
    console.error('Error IA Menú:', error);
    throw error;
  }
}

/**
 * Escanea imágenes de INVENTARIO / FACTURAS / LISTAS DE COMPRAS
 */
async function scanInventoryFromImages(base64Images, apiKey) {
  try {
    const model = getGeminiModel(apiKey, true);
    const prompt = `Eres un asistente de inventario para restaurantes. Analiza esta foto de un ticket, factura o lista de compras.

Por cada producto que identifiques, extrae EXACTAMENTE estos 3 datos:
- name: nombre del producto en español, claro y conciso (ej. "Tomate", "Pechuga de Pollo")
- totalCost: el precio TOTAL pagado por ese producto en esa compra (número, sin símbolo $)
- quantityFound: la cantidad de piezas/unidades/kilos que se compraron según el ticket (número)

Responde ÚNICAMENTE con este JSON, sin texto extra:
{
  "ingredients": [
    { "name": "string", "totalCost": 0, "quantityFound": 0 }
  ]
}

Si no puedes determinar un valor, usa 0. Consolida duplicados en una sola entrada.`;

    const imageParts = base64Images.map(base64 => ({ inlineData: { data: base64, mimeType: "image/jpeg" } }));
    const result = await model.generateContent([prompt, ...imageParts]);
    return JSON.parse(result.response.text());
  } catch (error) {
    console.error('Error IA Inventario:', error);
    throw error;
  }
}

module.exports = { scanMenuFromImages, scanInventoryFromImages };
