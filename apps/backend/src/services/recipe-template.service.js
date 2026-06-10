// recipe-template.service.js
//
// Genera plantillas Excel PERSONALIZADAS para que cada restaurante cargue sus
// insumos y recetas sin empezar de cero:
//   · Plantilla INSUMOS  — pre-llenada con los Ingredient que ya existen
//                          (los que el cliente capturó o que entraron por
//                          compras/escaneo de tickets).
//   · Plantilla RECETAS  — hoja PLATOS pre-llenada con los MenuItem del menú
//                          real (nombre + precio), y hoja SUBRECETAS con las
//                          subrecetas existentes. Si un plato ya tiene receta,
//                          sus ingredientes vienen pre-cargados para editar.
//
// El sistema calcula los costos; el Excel NO lleva fórmulas frágiles.
// Las plantillas se REGENERAN al vuelo desde la base — bajar de nuevo trae
// siempre lo más reciente.

const ExcelJS = require('exceljs');

// Mínimo de filas en blanco por platillo para listar sus ingredientes.
const MIN_ROWS_PER_DISH = 8;
// Mínimo de filas por subreceta.
const MIN_ROWS_PER_SUBRECIPE = 6;

// baseUnit (enum DB) → etiqueta amigable que llena/lee el cliente.
const BASE_UNIT_LABEL = { GRAM: 'g', ML: 'ml', PIECE: 'pz' };
const unitLabel = (u) => BASE_UNIT_LABEL[u] || 'pz';

// Estilo de encabezado reutilizable (ámbar de la identidad operativa).
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFB84D' } };
const HEADER_FONT = { bold: true, color: { argb: 'FF0C0C0E' }, size: 11 };
const TITLE_FONT = { bold: true, size: 14, color: { argb: 'FF0C0C0E' } };

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });
  row.height = 22;
}

// Aplica una lista desplegable (data validation) a un rango de una columna.
function applyListValidation(ws, colLetter, fromRow, toRow, options) {
  for (let r = fromRow; r <= toRow; r++) {
    ws.getCell(`${colLetter}${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${options.join(',')}"`],
    };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// PLANTILLA INSUMOS
// ───────────────────────────────────────────────────────────────────────────
//
// @param ingredients  Ingredient[] con type/category/supplier incluidos
// @param typeNames    string[]  nombres de IngredientType (para dropdown)
function buildInsumosWorkbook({ ingredients = [], typeNames = [] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MRTPVREST';

  // ── Hoja GUÍA ──
  const guia = wb.addWorksheet('GUIA');
  guia.getColumn(1).width = 100;
  guia.addRow(['PLANTILLA DE INSUMOS — Master Burguer no, TU restaurante']).font = TITLE_FONT;
  [
    '',
    'Esta hoja "INSUMOS" ya viene con los insumos que tu sistema conoce hoy.',
    'Edita lo que cambió (precio, proveedor) y AGREGA al final lo que falte.',
    '',
    'COLUMNAS:',
    '· Insumo*          — nombre del producto (ej. "Carne de res molida").',
    '· Tipo*            — COCINA / BARRA / DOMICILIOS / INSUMOS.',
    '· Categoría        — PROTEÍNAS, LÁCTEOS, etc. (opcional pero recomendado).',
    '· Proveedor        — quién te lo vende (opcional).',
    '· Unidad de compra — cómo lo compras: "caja", "kg", "bolsa 5kg"...',
    '· Precio de compra*— lo que pagas por esa unidad de compra.',
    '· Rinde (cantidad)*— cuántas unidades base salen de esa compra (ej. 40 piezas).',
    '· Unidad base*     — g, ml o pz. Es la unidad con la que se mide en recetas.',
    '· Peso bruto/neto  — opcional. Para mermas de limpieza (1000g bruto → 950g neto).',
    '· Stock            — cuánto tienes hoy (opcional).',
    '· Stock mínimo     — umbral de alerta para reabastecer (opcional).',
    '',
    'El COSTO POR UNIDAD lo calcula el sistema solo. No pongas fórmulas.',
    'No borres la fila de encabezados (la de colores).',
  ].forEach((t) => guia.addRow([t]));

  // ── Hoja INSUMOS ──
  const ws = wb.addWorksheet('INSUMOS');
  const headers = [
    'Insumo', 'Tipo', 'Categoría', 'Proveedor', 'Unidad de compra',
    'Precio de compra', 'Rinde (cantidad)', 'Unidad base',
    'Peso bruto', 'Peso neto', 'Stock', 'Stock mínimo',
  ];
  ws.addRow(headers);
  styleHeaderRow(ws.getRow(1));
  ws.columns.forEach((col, i) => { col.width = [28, 14, 22, 18, 18, 16, 16, 12, 12, 12, 10, 12][i] || 14; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const ing of ingredients) {
    ws.addRow([
      ing.name,
      ing.type?.name || '',
      ing.category?.name || '',
      ing.supplier?.name || '',
      ing.purchaseUnit || '',
      ing.purchaseCost ?? '',
      ing.purchaseQty ?? '',
      unitLabel(ing.baseUnit),
      ing.pesoBruto ?? '',
      ing.pesoNeto ?? '',
      ing.stock ?? '',
      ing.minStock ?? '',
    ]);
  }

  // Si no hay insumos aún, dejamos 2 filas de ejemplo para que se entienda.
  if (ingredients.length === 0) {
    ws.addRow(['Carne de res molida', 'COCINA', 'PROTEÍNAS', 'Costco', 'caja 40pz', 551.40, 40, 'pz', '', '', 12, 3]);
    ws.addRow(['Queso mozzarella', 'COCINA', 'LÁCTEOS', 'Costco', 'bolsa 2.26kg', 336, 2260, 'g', '', '', 4520, 500]);
  }

  // Filas vacías extra para que siempre haya dónde agregar.
  const firstDataRow = 2;
  const lastDataRow = ws.rowCount + 30;
  for (let i = 0; i < 30; i++) ws.addRow([]);

  // Dropdowns de ayuda.
  const typeOptions = (typeNames.length ? typeNames : ['COCINA', 'BARRA', 'DOMICILIOS', 'INSUMOS']);
  applyListValidation(ws, 'B', firstDataRow, lastDataRow, typeOptions);
  applyListValidation(ws, 'H', firstDataRow, lastDataRow, ['g', 'ml', 'pz']);

  return wb;
}

// ───────────────────────────────────────────────────────────────────────────
// PLANTILLA RECETAS (hojas PLATOS + SUBRECETAS)
// ───────────────────────────────────────────────────────────────────────────
//
// @param menuItems   MenuItem[] con category y recipe{items{ingredient,subRecipe}}
// @param subRecipes  SubRecipe[] con items{ingredient,nestedSubRecipe}
function buildRecetasWorkbook({ menuItems = [], subRecipes = [] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MRTPVREST';

  // ── Hoja GUÍA ──
  const guia = wb.addWorksheet('GUIA');
  guia.getColumn(1).width = 100;
  guia.addRow(['PLANTILLA DE RECETAS']).font = TITLE_FONT;
  [
    '',
    'Hoja "PLATOS": tus platillos del menú ya están listados con su nombre y precio.',
    'Bajo cada platillo tienes filas en blanco: escribe sus ingredientes y cantidades.',
    'Hoja "SUBRECETAS": preparaciones base reusables (salsas, mezclas, aderezos).',
    '',
    'COLUMNAS de PLATOS:',
    '· Platillo      — NO lo cambies: viene tal cual tu menú (así calza con el sistema).',
    '· Componente*   — un insumo (de tu plantilla de INSUMOS) o el nombre de una subreceta.',
    '· ¿Subreceta?   — SI si el componente es una subreceta; NO si es un insumo normal.',
    '· Cantidad*     — cuánto lleva el platillo, en la unidad base del insumo.',
    '· Unidad        — g, ml o pz.',
    '· Merma %       — desperdicio extra de ESE ingrediente en ESTE plato (0 si no aplica).',
    '· Precio mesa   — ya viene de tu menú; ajústalo si quieres.',
    '· Precio domicilio / Comisión % — opcionales, para calcular margen en apps de delivery.',
    '',
    'Si un insumo que escribes no existe todavía, el sistema te lo creará pendiente',
    'de revisión al subir la plantilla. Revisa esos después en Inventario.',
  ].forEach((t) => guia.addRow([t]));

  // ── Hoja PLATOS ──
  const platos = wb.addWorksheet('PLATOS');
  const pheaders = [
    'Platillo', 'Componente', '¿Subreceta?', 'Cantidad', 'Unidad', 'Merma %',
    'Precio mesa', 'Precio domicilio', 'Comisión %',
  ];
  platos.addRow(pheaders);
  styleHeaderRow(platos.getRow(1));
  platos.columns.forEach((col, i) => { col.width = [30, 28, 12, 12, 10, 10, 14, 16, 12][i] || 14; });
  platos.views = [{ state: 'frozen', ySplit: 1 }];

  let pRow = 2;
  const dishBlockRanges = []; // para aplicar dropdowns por bloque
  for (const mi of menuItems) {
    const items = mi.recipe?.items || [];
    const rowsForThisDish = Math.max(MIN_ROWS_PER_DISH, items.length);
    const blockStart = pRow;

    for (let i = 0; i < rowsForThisDish; i++) {
      const it = items[i];
      const isFirst = i === 0;
      let componente = '';
      let esSub = '';
      let cantidad = '';
      let unidad = '';
      let merma = '';
      if (it) {
        if (it.subRecipe) { componente = it.subRecipe.name; esSub = 'SI'; unidad = unitLabel(it.subRecipe.yieldUnit); }
        else if (it.ingredient) { componente = it.ingredient.name; esSub = 'NO'; unidad = unitLabel(it.ingredient.baseUnit); }
        cantidad = it.quantity ?? '';
        if (it.unit) unidad = unitLabel(it.unit);
        merma = it.wastagePercent ?? '';
      }
      platos.addRow([
        mi.name,            // Platillo repetido en todo el bloque (anclaje p/ parser)
        componente,
        esSub,
        cantidad,
        unidad,
        merma,
        isFirst ? (mi.price ?? '') : '',
        isFirst ? (mi.recipe?.priceDelivery ?? '') : '',
        isFirst ? (mi.recipe?.platformCommissionPct ?? '') : '',
      ]);
      pRow++;
    }
    dishBlockRanges.push([blockStart, pRow - 1]);
    // Separador visual entre platos: sombrear la columna Platillo del bloque.
    for (let r = blockStart; r < pRow; r++) {
      platos.getCell(`A${r}`).font = { bold: r === blockStart };
    }
  }

  if (menuItems.length === 0) {
    platos.addRow(['Hamburguesa Master', 'Carne de res molida', 'NO', 150, 'g', 5, 135, 145, 27]);
    platos.addRow(['Hamburguesa Master', 'Pan brioche', 'NO', 1, 'pz', 0, '', '', '']);
    platos.addRow(['Hamburguesa Master', 'Salsa Master', 'SI', 30, 'g', 0, '', '', '']);
    pRow += 3;
  }

  applyListValidation(platos, 'C', 2, pRow - 1, ['SI', 'NO']);
  applyListValidation(platos, 'E', 2, pRow - 1, ['g', 'ml', 'pz']);

  // ── Hoja SUBRECETAS ──
  const subs = wb.addWorksheet('SUBRECETAS');
  const sheaders = [
    'Subreceta', 'Componente', '¿Subreceta anidada?', 'Cantidad', 'Unidad',
    'Rinde (cantidad)', 'Unidad rinde', 'Margen error %',
  ];
  subs.addRow(sheaders);
  styleHeaderRow(subs.getRow(1));
  subs.columns.forEach((col, i) => { col.width = [26, 26, 18, 12, 10, 16, 14, 14][i] || 14; });
  subs.views = [{ state: 'frozen', ySplit: 1 }];

  let sRow = 2;
  for (const sr of subRecipes) {
    const items = sr.items || [];
    const rowsForThis = Math.max(MIN_ROWS_PER_SUBRECIPE, items.length);
    const blockStart = sRow;
    for (let i = 0; i < rowsForThis; i++) {
      const it = items[i];
      const isFirst = i === 0;
      let componente = '';
      let esSub = '';
      let cantidad = '';
      let unidad = '';
      if (it) {
        if (it.nestedSubRecipe) { componente = it.nestedSubRecipe.name; esSub = 'SI'; unidad = unitLabel(it.nestedSubRecipe.yieldUnit); }
        else if (it.ingredient) { componente = it.ingredient.name; esSub = 'NO'; unidad = unitLabel(it.ingredient.baseUnit); }
        cantidad = it.qty ?? '';
        if (it.unit) unidad = unitLabel(it.unit);
      }
      subs.addRow([
        sr.name,
        componente,
        esSub,
        cantidad,
        unidad,
        isFirst ? (sr.yieldQty ?? '') : '',
        isFirst ? unitLabel(sr.yieldUnit) : '',
        isFirst ? (sr.marginErrorPct ?? '') : '',
      ]);
      subs.getCell(`A${sRow}`).font = { bold: isFirst };
      sRow++;
    }
  }

  if (subRecipes.length === 0) {
    subs.addRow(['Salsa Master', 'Mayonesa', 'NO', 400, 'g', 800, 'g', 5]);
    subs.addRow(['Salsa Master', 'Chipotle', 'NO', 100, 'g', '', '', '']);
    sRow += 2;
  }

  applyListValidation(subs, 'C', 2, sRow - 1, ['SI', 'NO']);
  applyListValidation(subs, 'E', 2, sRow - 1, ['g', 'ml', 'pz']);
  applyListValidation(subs, 'G', 2, sRow - 1, ['g', 'ml', 'pz']);

  return wb;
}

module.exports = {
  buildInsumosWorkbook,
  buildRecetasWorkbook,
  BASE_UNIT_LABEL,
  unitLabel,
};
