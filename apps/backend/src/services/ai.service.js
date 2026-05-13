const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Servicio de IA consolidado para Menú e Inventario.
 * La apiKey se resuelve por request (BYOK) vía resolveAiKey({ restaurantId }).
 */
function getGeminiModel(apiKey, json = false) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    ...(json && { generationConfig: { responseMimeType: "application/json" } }),
  });
}

const xlsx = require('xlsx');
const csv = require('csv-parser');
const { Readable } = require('stream');

// Helpers para detectar archivos estructurados (no IA).
const SPREADSHEET_EXTS = ['.xlsx', '.xls', '.csv'];
function isSpreadsheet(file) {
  const name = (file?.originalname || '').toLowerCase();
  const mime = file?.mimetype || '';
  return (
    mime.includes('spreadsheetml') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    SPREADSHEET_EXTS.some((ext) => name.endsWith(ext))
  );
}

// Patrones de detección de columnas (ES + EN). Se mantienen en module
// scope para reusarlos en findHeaderRow y en el mapeo posterior.
const COL_PATTERNS = {
  name: /nombre|producto|item|description|descripci[oó]n|insumo/i,
  costPrimary: /costo|compra|unit[_\s]?price|\bcost\b/i,
  costFallback: /precio|\bprice\b/i,
  qty: /cantidad|stock|quantity|qty|unidades?/i,
};

// Busca la primera fila que parece contener headers (col "nombre" + al
// menos uno de "costo/precio/cantidad"). Necesario porque archivos
// del mundo real suelen traer 5-10 filas de título antes de la tabla
// (el Excel "Costeo de recetas" tiene headers en R8).
//
// Devuelve { headerRow: 0-based, headers: string[] } o null si no halla.
function findHeaderRow(matrix) {
  const MAX_SCAN = Math.min(matrix.length, 30); // cap defensivo
  for (let r = 0; r < MAX_SCAN; r++) {
    const row = matrix[r] || [];
    const cells = row.map((c) => (c == null ? '' : String(c).trim()));
    const hasName = cells.some((c) => COL_PATTERNS.name.test(c));
    const hasCost = cells.some((c) => COL_PATTERNS.costPrimary.test(c) || COL_PATTERNS.costFallback.test(c));
    const hasQty = cells.some((c) => COL_PATTERNS.qty.test(c));
    if (hasName && (hasCost || hasQty)) {
      return { headerRow: r, headers: cells };
    }
  }
  return null;
}

/**
 * Procesa archivos de Excel o CSV para extraer ingredientes de inventario.
 * Busca columnas comunes como "nombre", "producto", "costo", "precio", "cantidad", "stock".
 * Detecta automáticamente la fila de headers — admite archivos con filas
 * de título arriba (típico en plantillas reales como "Costeo de recetas").
 * @param {Object} file Objeto de archivo de multer (buffer, mimetype)
 */
async function parseInventoryFile(file) {
  try {
    let rawData = [];

    if (file.mimetype.includes('spreadsheetml') || file.mimetype.includes('excel') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      // PROCESAR EXCEL
      // Iteramos TODAS las hojas en orden y nos quedamos con la primera que
      // tenga headers detectables. Archivos reales suelen empezar con una
      // hoja "GUIA"/"INSTRUCCIONES" vacía y la tabla real va en la segunda.
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      let pickedRange = null;
      let pickedWorksheet = null;
      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const matrix = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const found = findHeaderRow(matrix);
        if (found) {
          pickedRange = found.headerRow;
          pickedWorksheet = ws;
          break;
        }
      }
      if (pickedWorksheet == null) {
        // Fallback: no se detectaron headers en ninguna hoja → leer la
        // primera asumiendo R1 (comportamiento legacy).
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rawData = xlsx.utils.sheet_to_json(firstSheet, { defval: '' });
      } else {
        rawData = xlsx.utils.sheet_to_json(pickedWorksheet, {
          defval: '',
          range: pickedRange,
        });
      }
    } else if (file.mimetype.includes('csv') || file.originalname.endsWith('.csv')) {
      // PROCESAR CSV
      // csv-parser asume R1 = headers. Para CSVs raros con filas de título
      // arriba, primero leemos crudo, detectamos headers y reparseamos.
      const rawText = file.buffer.toString('utf-8');
      const lines = rawText.split(/\r?\n/);
      const matrix = lines.map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
      const found = findHeaderRow(matrix);
      const offset = found?.headerRow ?? 0;
      const trimmedBuffer = Buffer.from(lines.slice(offset).join('\n'), 'utf-8');
      rawData = await new Promise((resolve, reject) => {
        const results = [];
        const stream = Readable.from(trimmedBuffer);
        stream
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', () => resolve(results))
          .on('error', (err) => reject(err));
      });
    } else {
      throw new Error('Formato de archivo no soportado para importación directa.');
    }

    // MAPEO INTELIGENTE DE COLUMNAS
    // Intentamos adivinar qué columna es qué basándonos en nombres comunes.
    return {
      ingredients: rawData
        .map((row) => {
          const keys = Object.keys(row);

          const nameKey = keys.find((k) => COL_PATTERNS.name.test(k));
          // Costo: prioridad a "costo/compra", fallback a "precio"
          const costKey =
            keys.find((k) => COL_PATTERNS.costPrimary.test(k)) ||
            keys.find((k) => COL_PATTERNS.costFallback.test(k));
          const qtyKey = keys.find((k) => COL_PATTERNS.qty.test(k));

          const nameRaw = nameKey ? String(row[nameKey]).trim() : '';
          const name = nameRaw || 'Producto sin nombre';

          return {
            name,
            totalCost: costKey ? parseFloat(String(row[costKey]).replace(/[^0-9.]/g, '')) || 0 : 0,
            quantityFound: qtyKey ? parseFloat(String(row[qtyKey]).replace(/[^0-9.]/g, '')) || 1 : 1,
          };
        })
        // Filtro estricto: descartar filas sin nombre real Y sin costo.
        // Antes era `||` que dejaba pasar filas con costo>0 pero sin
        // nombre (basura del header o filas de total).
        .filter((item) => item.name !== 'Producto sin nombre' && item.totalCost >= 0),
    };
  } catch (error) {
    console.error('Error procesando archivo de inventario:', error);
    throw error;
  }
}

/**
 * Escanea imágenes de un MENÚ
 * @param {Array<{data: string, mimeType: string}>} imageParts
 */
async function scanMenuFromImages(imageParts, apiKey) {
  try {
    const model = getGeminiModel(apiKey);
    const prompt = `Analiza estas imágenes de un menú de restaurante. Extrae platos, precios, descripciones y categorías. Devuelve un JSON: { "categories": [], "items": [{ "name": "", "price": 0, "description": "", "category": "" }] }. Solo JSON puro.`;
    
    const formattedImages = imageParts.map(p => ({ inlineData: { data: p.data, mimeType: p.mimeType || "image/jpeg" } }));
    const result = await model.generateContent([prompt, ...formattedImages]);
    const text = result.response.text();
    
    // Limpieza robusta de markdown por si Gemini ignora el prompt de "solo JSON"
    const jsonStr = text.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Error IA Menú:', error);
    throw error;
  }
}

/**
 * Escanea imágenes de INVENTARIO / FACTURAS / LISTAS DE COMPRAS
 * @param {Array<{data: string, mimeType: string}>} imageParts
 */
async function scanInventoryFromImages(imageParts, apiKey) {
  try {
    const model = getGeminiModel(apiKey, true);
    const prompt = `Eres un asistente de inventario para restaurantes. Analiza esta foto de un ticket, factura o lista de compras.

Por cada producto que identifiques, extrae EXACTAMENTE estos 3 datos:
- name: nombre del producto en español, claro y conciso (ej. "Tomate", "Pechuga de Pollo")
- totalCost: el precio TOTAL pagado por ese producto en esa compra (número, sin símbolo $)
- quantityFound: la cantidad de piezas/unidades/kilos que se compraron según el ticket (número)

Responde con este formato JSON:
{
  "ingredients": [
    { "name": "string", "totalCost": 0, "quantityFound": 0 }
  ]
}

Si no puedes determinar un valor, usa 0. Consolida duplicados en una sola entrada.`;

    const formattedImages = imageParts.map(p => ({ inlineData: { data: p.data, mimeType: p.mimeType || "image/jpeg" } }));
    const result = await model.generateContent([prompt, ...formattedImages]);
    const text = result.response.text();
    
    // Aunque usemos responseMimeType: application/json, Gemini a veces
    // envuelve el resultado en markdown si el prompt es ambiguo.
    const jsonStr = text.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Error IA Inventario:', error);
    throw error;
  }
}

module.exports = { scanMenuFromImages, scanInventoryFromImages, parseInventoryFile, isSpreadsheet };
