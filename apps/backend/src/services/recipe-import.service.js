// recipe-import.service.js
//
// Parser PURO (sin acceso a DB) de las plantillas Excel que genera
// recipe-template.service.js. Lee los buffers subidos y devuelve estructuras
// normalizadas. El matching contra la base y la escritura viven en las rutas.
//
//   parseInsumosWorkbook(buffer)  → { insumos: [...] }
//   parseRecetasWorkbook(buffer)  → { platos: [...], subrecetas: [...] }
//
// Tolerante a:
//   · filas de título arriba del encabezado (busca la fila de headers)
//   · que el nombre del platillo/subreceta se repita en cada fila O sólo una vez
//   · unidades escritas como "Gramo (g)", "g", "gr", "Unidad (Und)", etc.
//   · celdas con fórmulas (lee el resultado cacheado) y richText

const ExcelJS = require('exceljs');

// ── Unidades ────────────────────────────────────────────────────────────────
const UNIT_TO_BASE = {
  g: 'GRAM', gr: 'GRAM', grs: 'GRAM', gramo: 'GRAM', gramos: 'GRAM',
  ml: 'ML', mililitro: 'ML', mililitros: 'ML', cc: 'ML',
  pz: 'PIECE', pza: 'PIECE', pzas: 'PIECE', pieza: 'PIECE', piezas: 'PIECE',
  und: 'PIECE', unidad: 'PIECE', unidades: 'PIECE', u: 'PIECE',
};
function normalizeUnit(raw, fallback = 'PIECE') {
  if (!raw) return fallback;
  // "Gramo (g)" → quita paréntesis y se queda con la palabra clave
  let s = String(raw).toLowerCase().trim();
  const paren = s.match(/\(([^)]+)\)/);
  if (paren) s = paren[1].trim(); // si dice "Gramo (g)" usa "g"
  s = s.replace(/[().]/g, '').trim();
  return UNIT_TO_BASE[s] || UNIT_TO_BASE[s.replace(/s$/, '')] || fallback;
}

// ── Lectura de celdas ─────────────────────────────────────────────────────
function cellValue(cell) {
  let v = cell ? cell.value : null;
  if (v && typeof v === 'object') {
    if ('result' in v) v = v.result;
    else if ('text' in v) v = v.text;
    else if ('richText' in v && Array.isArray(v.richText)) v = v.richText.map((t) => t.text).join('');
    else if ('hyperlink' in v) v = v.text || '';
  }
  return v == null ? '' : v;
}
function cellStr(cell) { return String(cellValue(cell)).trim(); }
function cellNum(cell) {
  const v = cellValue(cell);
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Normaliza texto para comparar headers/nombres (sin acentos, minúsculas).
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Encuentra la fila de encabezados: la primera (de las primeras 15) cuyo
// conjunto de celdas contiene `anchor` (normalizado).
function findHeaderRow(ws, anchor) {
  const a = norm(anchor);
  const limit = Math.min(ws.rowCount, 15);
  for (let r = 1; r <= limit; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= ws.columnCount; c++) {
      if (norm(cellStr(row.getCell(c))) === a) return r;
    }
  }
  return null;
}

// Mapea columnas: specs es [ [key, predicate(normHeader)], ... ] en orden de
// prioridad (más específico primero). Cada columna se asigna a lo más una key.
function mapColumns(ws, headerRowIdx, specs) {
  const row = ws.getRow(headerRowIdx);
  const headers = [];
  for (let c = 1; c <= ws.columnCount; c++) headers.push({ c, h: norm(cellStr(row.getCell(c))) });
  const map = {};
  const used = new Set();
  for (const [key, pred] of specs) {
    for (const { c, h } of headers) {
      if (used.has(c) || !h) continue;
      if (pred(h)) { map[key] = c; used.add(c); break; }
    }
  }
  return map;
}

function isRowEmpty(ws, r, cols) {
  return cols.every((c) => c == null || cellStr(ws.getRow(r).getCell(c)) === '');
}

// ── INSUMOS ────────────────────────────────────────────────────────────────
async function parseInsumos(ws) {
  const headerRow = findHeaderRow(ws, 'Insumo') || findHeaderRow(ws, 'Nombre') || findHeaderRow(ws, 'Producto');
  if (!headerRow) return { insumos: [], error: 'No se encontró el encabezado "Insumo" en la hoja.' };

  const col = mapColumns(ws, headerRow, [
    ['name', (h) => h === 'insumo' || h === 'nombre' || h === 'producto'],
    ['type', (h) => h.includes('tipo')],
    ['category', (h) => h.includes('categoria')],
    ['supplier', (h) => h.includes('proveedor')],
    ['purchaseUnit', (h) => h.includes('unidad') && h.includes('compra')],
    ['purchaseCost', (h) => h.includes('precio') && h.includes('compra')],
    ['purchaseQty', (h) => h.includes('rinde') || h.includes('cantidad')],
    ['baseUnit', (h) => h.includes('unidad') && h.includes('base')],
    ['pesoBruto', (h) => h.includes('bruto')],
    ['pesoNeto', (h) => h.includes('neto')],
    ['minStock', (h) => h.includes('stock') && (h.includes('minimo') || h.includes('min'))],
    ['stock', (h) => h.includes('stock')],
  ]);
  if (!col.name) return { insumos: [], error: 'No se pudo identificar la columna de nombre del insumo.' };

  const insumos = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const name = cellStr(ws.getRow(r).getCell(col.name));
    if (!name) continue;
    if (/^ejemplo/i.test(name)) continue;
    insumos.push({
      name,
      type: col.type ? cellStr(ws.getRow(r).getCell(col.type)) : '',
      category: col.category ? cellStr(ws.getRow(r).getCell(col.category)) : '',
      supplier: col.supplier ? cellStr(ws.getRow(r).getCell(col.supplier)) : '',
      purchaseUnit: col.purchaseUnit ? cellStr(ws.getRow(r).getCell(col.purchaseUnit)) : '',
      purchaseCost: col.purchaseCost ? cellNum(ws.getRow(r).getCell(col.purchaseCost)) : null,
      purchaseQty: col.purchaseQty ? cellNum(ws.getRow(r).getCell(col.purchaseQty)) : null,
      baseUnit: normalizeUnit(col.baseUnit ? cellStr(ws.getRow(r).getCell(col.baseUnit)) : ''),
      pesoBruto: col.pesoBruto ? cellNum(ws.getRow(r).getCell(col.pesoBruto)) : null,
      pesoNeto: col.pesoNeto ? cellNum(ws.getRow(r).getCell(col.pesoNeto)) : null,
      stock: col.stock ? cellNum(ws.getRow(r).getCell(col.stock)) : null,
      minStock: col.minStock ? cellNum(ws.getRow(r).getCell(col.minStock)) : null,
    });
  }
  return { insumos };
}

// ── PLATOS ───────────────────────────────────────────────────────────────
async function parsePlatos(ws) {
  const headerRow = findHeaderRow(ws, 'Platillo');
  if (!headerRow) return { platos: [], error: 'No se encontró el encabezado "Platillo".' };

  const col = mapColumns(ws, headerRow, [
    ['dish', (h) => h === 'platillo' || h === 'plato'],
    ['isSub', (h) => h.includes('subreceta')],
    ['component', (h) => h.includes('componente') || h.includes('insumo') || h.includes('ingrediente')],
    ['priceDelivery', (h) => h.includes('precio') && h.includes('domicilio')],
    ['priceMesa', (h) => h.includes('precio')],
    ['commission', (h) => h.includes('comision')],
    ['qty', (h) => h.includes('cantidad')],
    ['unit', (h) => h.includes('unidad')],
    ['wastage', (h) => h.includes('merma')],
  ]);
  if (!col.dish || !col.component) return { platos: [], error: 'Faltan columnas "Platillo" o "Componente".' };

  const dishes = new Map(); // name → dish
  let current = null;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const dishName = cellStr(ws.getRow(r).getCell(col.dish));
    if (dishName) {
      if (!dishes.has(dishName)) {
        dishes.set(dishName, { name: dishName, priceMesa: null, priceDelivery: null, commission: null, items: [] });
      }
      current = dishes.get(dishName);
    }
    if (!current) continue;

    // Captura pricing del bloque (lo primero no-vacío gana).
    if (col.priceMesa && current.priceMesa == null) {
      const v = cellNum(ws.getRow(r).getCell(col.priceMesa));
      if (v != null) current.priceMesa = v;
    }
    if (col.priceDelivery && current.priceDelivery == null) {
      const v = cellNum(ws.getRow(r).getCell(col.priceDelivery));
      if (v != null) current.priceDelivery = v;
    }
    if (col.commission && current.commission == null) {
      const v = cellNum(ws.getRow(r).getCell(col.commission));
      if (v != null) current.commission = v;
    }

    const component = cellStr(ws.getRow(r).getCell(col.component));
    if (!component) continue;
    const isSub = col.isSub ? /^s/i.test(cellStr(ws.getRow(r).getCell(col.isSub))) : false; // "SI"/"Sí"
    current.items.push({
      component,
      isSub,
      qty: col.qty ? cellNum(ws.getRow(r).getCell(col.qty)) : null,
      unit: normalizeUnit(col.unit ? cellStr(ws.getRow(r).getCell(col.unit)) : ''),
      wastage: col.wastage ? (cellNum(ws.getRow(r).getCell(col.wastage)) || 0) : 0,
    });
  }
  return { platos: [...dishes.values()].filter((d) => d.items.length > 0) };
}

// ── SUBRECETAS ───────────────────────────────────────────────────────────
async function parseSubrecetas(ws) {
  const headerRow = findHeaderRow(ws, 'Subreceta');
  if (!headerRow) return { subrecetas: [] }; // hoja opcional

  const col = mapColumns(ws, headerRow, [
    ['name', (h) => h === 'subreceta'],
    ['isSub', (h) => h.includes('anidada')],
    ['component', (h) => h.includes('componente') || h.includes('insumo') || h.includes('ingrediente')],
    ['yieldUnit', (h) => h.includes('unidad') && h.includes('rinde')],
    ['yieldQty', (h) => h.includes('rinde')],
    ['marginErrorPct', (h) => h.includes('margen')],
    ['qty', (h) => h.includes('cantidad')],
    ['unit', (h) => h.includes('unidad')],
  ]);
  if (!col.name || !col.component) return { subrecetas: [] };

  const subs = new Map();
  let current = null;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const name = cellStr(ws.getRow(r).getCell(col.name));
    if (name) {
      if (!subs.has(name)) {
        subs.set(name, { name, yieldQty: null, yieldUnit: 'GRAM', marginErrorPct: 0, items: [] });
      }
      current = subs.get(name);
    }
    if (!current) continue;

    if (col.yieldQty && current.yieldQty == null) {
      const v = cellNum(ws.getRow(r).getCell(col.yieldQty));
      if (v != null) current.yieldQty = v;
    }
    if (col.yieldUnit) {
      const u = cellStr(ws.getRow(r).getCell(col.yieldUnit));
      if (u) current.yieldUnit = normalizeUnit(u);
    }
    if (col.marginErrorPct) {
      const v = cellNum(ws.getRow(r).getCell(col.marginErrorPct));
      if (v != null) current.marginErrorPct = v;
    }

    const component = cellStr(ws.getRow(r).getCell(col.component));
    if (!component) continue;
    const isSub = col.isSub ? /^s/i.test(cellStr(ws.getRow(r).getCell(col.isSub))) : false;
    current.items.push({
      component,
      isSub,
      qty: col.qty ? cellNum(ws.getRow(r).getCell(col.qty)) : null,
      unit: normalizeUnit(col.unit ? cellStr(ws.getRow(r).getCell(col.unit)) : ''),
    });
  }
  return { subrecetas: [...subs.values()].filter((s) => s.items.length > 0) };
}

// ── Entradas públicas ───────────────────────────────────────────────────
async function parseWorkbookBuffer(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

async function importInsumosFromBuffer(buffer) {
  const wb = await parseWorkbookBuffer(buffer);
  const ws = wb.getWorksheet('INSUMOS') || wb.worksheets.find((w) => findHeaderRow(w, 'Insumo'));
  if (!ws) return { insumos: [], error: 'No se encontró la hoja INSUMOS.' };
  return parseInsumos(ws);
}

async function importRecetasFromBuffer(buffer) {
  const wb = await parseWorkbookBuffer(buffer);
  const wsP = wb.getWorksheet('PLATOS') || wb.worksheets.find((w) => findHeaderRow(w, 'Platillo'));
  const wsS = wb.getWorksheet('SUBRECETAS') || wb.worksheets.find((w) => findHeaderRow(w, 'Subreceta'));
  const platos = wsP ? await parsePlatos(wsP) : { platos: [], error: 'No se encontró la hoja PLATOS.' };
  const subrecetas = wsS ? await parseSubrecetas(wsS) : { subrecetas: [] };
  return {
    platos: platos.platos || [],
    subrecetas: subrecetas.subrecetas || [],
    error: platos.error,
  };
}

// Costo por unidad base, replicando el modelo de la plantilla real:
//   costo = (precioCompra / rinde) × (pesoBruto / pesoNeto)
function computeCostPerBase({ purchaseCost, purchaseQty, pesoBruto, pesoNeto }) {
  const pc = Number(purchaseCost);
  const pq = Number(purchaseQty);
  if (!Number.isFinite(pc) || !Number.isFinite(pq) || pq <= 0) return 0;
  let cost = pc / pq;
  if (Number.isFinite(Number(pesoBruto)) && Number.isFinite(Number(pesoNeto)) && Number(pesoNeto) > 0) {
    cost *= Number(pesoBruto) / Number(pesoNeto);
  }
  return cost;
}

module.exports = {
  importInsumosFromBuffer,
  importRecetasFromBuffer,
  computeCostPerBase,
  normalizeUnit,
  norm,
};
