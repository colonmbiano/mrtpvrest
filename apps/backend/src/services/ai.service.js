const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Servicio de IA consolidado para Menú e Inventario
 */
async function getGeminiModel() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  return genAI.getGenerativeModel({ model: "gemini-flash-latest" });
}

/**
 * Escanea imágenes de un MENÚ
 */
async function scanMenuFromImages(base64Images) {
  try {
    const model = await getGeminiModel();
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
async function scanInventoryFromImages(base64Images) {
  try {
    const model = await getGeminiModel();
    const prompt = `Analiza estas fotos de una factura, ticket de compra o lista de inventario.
    Extrae los ingredientes o productos, su cantidad recibida y el costo unitario si aparece.
    Devuelve el resultado ESTRICTAMENTE en formato JSON:
    {
      "ingredients": [
        { "name": "nombre ingrediente", "quantity": 0, "unit": "pz/kg/gr/lt", "cost": 0 }
      ]
    }.
    Solo JSON puro. Consolida todo en una sola lista.`;

    const imageParts = base64Images.map(base64 => ({ inlineData: { data: base64, mimeType: "image/jpeg" } }));
    const result = await model.generateContent([prompt, ...imageParts]);
    const text = result.response.text();

    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (error) {
    console.error('Error IA Inventario:', error);
    throw error;
  }
}

module.exports = { scanMenuFromImages, scanInventoryFromImages };
