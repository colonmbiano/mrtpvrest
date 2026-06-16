const { GoogleGenerativeAI } = require("@google/generative-ai");
const { prisma } = require('@mrtpvrest/database');

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

const ExcelJS = require('exceljs');
const csv = require('csv-parser');
const { Readable } = require('stream');

const VALID_RECIPE_UNITS = new Set(['GRAM', 'ML', 'PIECE']);

function extractJsonObject(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('La IA no devolvió un JSON válido');
  }
}

function normalizeRecipeUnit(unit, fallback = 'GRAM') {
  const value = String(unit || '').trim().toUpperCase();
  return VALID_RECIPE_UNITS.has(value) ? value : fallback;
}

function normalizePositiveNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

// Helpers para detectar archivos estructurados (no IA).
const SPREADSHEET_EXTS = ['.xlsx', '.csv'];
function isSpreadsheet(file) {
  const name = (file?.originalname || '').toLowerCase();
  const mime = file?.mimetype || '';
  return (
    mime.includes('spreadsheetml') ||
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

function normalizeCellValue(value) {
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (value.text) return value.text;
    if (value.result != null) return value.result;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
  }
  return value;
}

function worksheetToMatrix(worksheet) {
  const matrix = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = [];
    for (let i = 1; i <= row.cellCount; i++) {
      values.push(normalizeCellValue(row.getCell(i).value));
    }
    matrix[rowNumber - 1] = values;
  });
  return matrix;
}

function matrixToObjects(matrix, headerRow = 0) {
  const headers = (matrix[headerRow] || []).map((value, index) => {
    const header = String(value || '').trim();
    return header || `Column${index + 1}`;
  });

  return matrix.slice(headerRow + 1)
    .map((row = []) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
    .filter((row) => Object.values(row).some((value) => value !== '' && value != null));
}

async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
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

    if (file.mimetype.includes('spreadsheetml') || file.originalname.endsWith('.xlsx')) {
      // PROCESAR EXCEL
      // Iteramos TODAS las hojas en orden y nos quedamos con la primera que
      // tenga headers detectables. Archivos reales suelen empezar con una
      // hoja "GUIA"/"INSTRUCCIONES" vacía y la tabla real va en la segunda.
      const workbook = await loadWorkbook(file.buffer);
      let pickedRange = null;
      let pickedMatrix = null;
      for (const ws of workbook.worksheets) {
        const matrix = worksheetToMatrix(ws);
        const found = findHeaderRow(matrix);
        if (found) {
          pickedRange = found.headerRow;
          pickedMatrix = matrix;
          break;
        }
      }
      if (pickedMatrix == null) {
        // Fallback: no se detectaron headers en ninguna hoja → leer la
        // primera asumiendo R1 (comportamiento legacy).
        const firstSheet = workbook.worksheets[0];
        rawData = matrixToObjects(worksheetToMatrix(firstSheet), 0);
      } else {
        rawData = matrixToObjects(pickedMatrix, pickedRange);
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
    const prompt = `Analiza estas imágenes de un menú de restaurante. Extrae categorías, platos base, precios, descripciones, variantes y modificadores. 

Aplica estrictamente estas reglas de negocio y diseño UX para un TPV de alta velocidad:

1. SEPARACIÓN DE CATEGORÍAS: Si la categoría en la imagen es "Alitas y Boneless" o similar, divídela obligatoriamente en dos categorías distintas: "Alitas" y "Boneless".
2. CONSOLIDACIÓN DE PRODUCTOS BASE: No dupliques platos. Si un producto cambia de precio por tamaño (chico/grande), gramaje (150g/250g) o tipo de carne base, conviértelo en un único producto y pon esas variaciones en el arreglo "base_options".
3. EXTRACCIÓN DE MODIFICADORES GLOBALES: Los ingredientes extra (ej. tocino, queso extra, piña) o los sabores elegibles (ej. salsas de alitas, sabores de aguas) que apliquen a múltiples productos NO van en las variantes del producto. Extráelos en un bloque independiente llamado "global_modifiers" y vincula el producto usando su ID en "allowed_modifiers".
4. REGLA UX 80/20: Analiza el menú e infiere cuáles son los productos estrella o de alta rotación (los más comunes). A esos productos, asígnales "pantalla_principal": true. Al resto, asígnales false.
5. CATEGORÍAS GEMELAS (MISMO RELLENO, DISTINTA PREPARACIÓN): Si detectas dos categorías que comparten exactamente el mismo conjunto de proteínas/rellenos/sabores y solo cambian por estilo de preparación y precio (ejemplos típicos: "Burritos" vs "Gringas", "Alitas" vs "Boneless", "Tacos" vs "Volcanes", "Tortas" vs "Quesadillas"), aplica TODAS estas sub-reglas:
   a) Crea las DOS categorías por separado (NO las consolides en un solo producto con base_options).
   b) En cada categoría, crea un producto independiente por cada relleno/sabor con su precio específico.
   c) Usa la MISMA raíz de id para emparejar los productos hermanos: por ejemplo "burrito-pastor" y "gringa-pastor", "alitas-bbq" y "boneless-bbq". El prefijo siempre debe ser el slug de la categoría.
   d) Ambos productos gemelos deben referenciar el MISMO grupo de modificadores en "allowed_modifiers" (no dupliques el grupo en global_modifiers; reutilízalo).
   e) Si el menú define los extras o aderezos en una sola tabla compartida (ej. "Add Aderezo Extra +$15" que aplica para Alitas Y Boneless), ese grupo debe quedar en global_modifiers UNA sola vez y vincularse desde ambos lados.

Devuelve un JSON puro (sin markdown, sin bloques \`\`\`json, solo el objeto) con este formato exacto:

{
  "categories": ["Hamburguesas", "Alitas", "Boneless"],
  "items": [
    {
      "id": "slug_unico_del_producto",
      "name": "Nombre del Producto Base",
      "description": "Descripción o ingredientes base",
      "category": "Categoría correspondiente",
      "pantalla_principal": true,
      "base_options": [
        { "name": "Variante Base 1 (Ej: 150GR)", "price": 105 }
      ],
      "allowed_modifiers": ["id_del_grupo_de_modificadores"]
    }
  ],
  "global_modifiers": {
    "id_del_grupo_de_modificadores": [
      { "name": "Nombre del modificador/extra/sabor", "price_extra": 20 }
    ]
  }
}`;
    
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

async function generateRecipeForId({ menuItemId, restaurantId, apiKey }) {
  const menuItem = await prisma.menuItem.findFirst({ where: { id: menuItemId, restaurantId } });
  if (!menuItem) throw new Error('Platillo no encontrado');

  const model = getGeminiModel(apiKey, true);
  const prompt = `Actúa como un Chef Ejecutivo y un Ingeniero de Costos experto en Food & Beverage para restaurantes de comida rápida.

Tu tarea es tomar el producto del menú "${menuItem.name}" e inferir de forma automática su "Receta Técnica de Inventario" y sus pasos de preparación rápida para la cocina.

Para los ingredientes que no tengan cantidades explícitas en el menú, infiere proporciones estándar de la industria (ej: 30g de queso, 15g de aderezo, 20g de lechuga, 1 pieza de pan).

Devuelve un JSON puro con este formato exacto:
{
  "recetas": [
    {
      "producto_id": "${menuItem.id}",
      "insumos_inventario": [
        { "nombre_insumo": "Carne Angus", "cantidad": 150, "unidad": "GRAM" }
      ],
      "subrecetas_incluidas": [
        { "nombre_subreceta": "Salsa BBQ Casera", "cantidad": 30, "unidad": "ML" }
      ],
      "instrucciones_cocina": [
        "Sellar carne en plancha a 180°C por 3 minutos por lado."
      ]
    }
  ],
  "subrecetas_globales": [
    {
      "nombre_subreceta": "Salsa BBQ Casera",
      "rendimiento": { "cantidad": 1000, "unidad": "ML" },
      "insumos_inventario": [
        { "nombre_insumo": "Ketchup", "cantidad": 500, "unidad": "ML" },
        { "nombre_insumo": "Azúcar Mascabado", "cantidad": 200, "unidad": "GRAM" }
      ],
      "instrucciones_preparacion": [
        "Mezclar todos los ingredientes y reducir a fuego lento por 20 mins."
      ]
    }
  ]
}

Ten en cuenta que las unidades válidas son "GRAM", "ML" y "PIECE". NO uses IDs o slugs, usa solo el campo "nombre_insumo" y "nombre_subreceta".
Genera las recetas automáticas para el siguiente platillo:
- Nombre: ${menuItem.name}
- Descripción: ${menuItem.description || "N/A"}`;

  const result = await model.generateContent([prompt]);
  const text = result.response.text();
  const aiResponse = extractJsonObject(text);

  return await prisma.$transaction(async (tx) => {
    // 1. Crear subrecetas globales
    const subRecipesGlobales = aiResponse.subrecetas_globales || [];
    for (const rawSub of subRecipesGlobales) {
      const subRecipeName = normalizeName(rawSub.nombre_subreceta);
      if (!subRecipeName) continue;
      const yieldQty = normalizePositiveNumber(rawSub.rendimiento?.cantidad, 1000);
      const yieldUnit = normalizeRecipeUnit(rawSub.rendimiento?.unidad);

      let subRecipe = await tx.subRecipe.findFirst({
        where: { name: { equals: subRecipeName, mode: 'insensitive' }, restaurantId: menuItem.restaurantId }
      });

      if (!subRecipe) {
        subRecipe = await tx.subRecipe.create({
          data: {
            restaurantId: menuItem.restaurantId,
            name: subRecipeName,
            yieldQty,
            yieldUnit,
            preparationSteps: rawSub.instrucciones_preparacion || [],
            isPendingReview: true
          }
        });

        for (const rawIng of (rawSub.insumos_inventario || [])) {
          const ingredientName = normalizeName(rawIng.nombre_insumo);
          const quantity = normalizePositiveNumber(rawIng.cantidad);
          const unit = normalizeRecipeUnit(rawIng.unidad);
          if (!ingredientName || quantity <= 0) continue;

          let ingredient = await tx.ingredient.findFirst({
            where: { name: { equals: ingredientName, mode: 'insensitive' }, restaurantId: menuItem.restaurantId }
          });

          if (!ingredient) {
            ingredient = await tx.ingredient.create({
              data: {
                restaurantId: menuItem.restaurantId,
                name: ingredientName,
                cost: 0,
                baseUnit: unit,
                isPendingReview: true
              }
            });
          }

          await tx.subRecipeItem.create({
            data: {
              subRecipeId: subRecipe.id,
              ingredientId: ingredient.id,
              qty: quantity,
              unit
            }
          });
        }
      }
    }

    // 2. Armar receta del platillo
    const recetaData = aiResponse.recetas?.find(r => r.producto_id === menuItem.id) || aiResponse.recetas?.[0];
    if (!recetaData) throw new Error('La IA no devolvió receta para este platillo');

    // Limpiar items previos de la receta BASE (variantId NULL) si existe.
    // La unicidad ahora es (menuItemId, variantId), por eso findFirst + create
    // manual en vez de upsert por menuItemId.
    const existingRecipe = await tx.recipe.findFirst({ where: { menuItemId, variantId: null } });
    if (existingRecipe) {
      await tx.recipeItem.deleteMany({ where: { recipeId: existingRecipe.id } });
    }

    const recipe = existingRecipe
      ? await tx.recipe.update({
          where: { id: existingRecipe.id },
          data: { preparationSteps: recetaData.instrucciones_cocina || [] }
        })
      : await tx.recipe.create({
          data: {
            menuItemId,
            restaurantId: menuItem.restaurantId,
            preparationSteps: recetaData.instrucciones_cocina || []
          }
        });

    for (const rawIng of (recetaData.insumos_inventario || [])) {
      const ingredientName = normalizeName(rawIng.nombre_insumo);
      const quantity = normalizePositiveNumber(rawIng.cantidad);
      const unit = normalizeRecipeUnit(rawIng.unidad);
      if (!ingredientName || quantity <= 0) continue;

      let ingredient = await tx.ingredient.findFirst({
        where: { name: { equals: ingredientName, mode: 'insensitive' }, restaurantId: menuItem.restaurantId }
      });

      if (!ingredient) {
        ingredient = await tx.ingredient.create({
          data: {
            restaurantId: menuItem.restaurantId,
            name: ingredientName,
            cost: 0,
            baseUnit: unit,
            isPendingReview: true
          }
        });
      }

      await tx.recipeItem.create({
        data: {
          recipeId: recipe.id,
          ingredientId: ingredient.id,
          quantity,
          unit
        }
      });
    }

    for (const rawSub of (recetaData.subrecetas_incluidas || [])) {
      const subRecipeName = normalizeName(rawSub.nombre_subreceta);
      const quantity = normalizePositiveNumber(rawSub.cantidad);
      const unit = normalizeRecipeUnit(rawSub.unidad);
      if (!subRecipeName || quantity <= 0) continue;

      let subRecipe = await tx.subRecipe.findFirst({
        where: { name: { equals: subRecipeName, mode: 'insensitive' }, restaurantId: menuItem.restaurantId }
      });

      if (subRecipe) {
        await tx.recipeItem.create({
          data: {
            recipeId: recipe.id,
            subRecipeId: subRecipe.id,
            quantity,
            unit
          }
        });
      }
    }

    return recipe;
  });
}

module.exports = { scanMenuFromImages, scanInventoryFromImages, parseInventoryFile, isSpreadsheet, generateRecipeForId };
