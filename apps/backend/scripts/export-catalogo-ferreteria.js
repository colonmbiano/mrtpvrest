/**
 * Exporta el catálogo de ferretería a CSV, para revisarlo en Excel con el
 * prospecto o cargarlo en otro tenant.
 *
 * No toca la base de datos: lee scripts/data/catalogo-ferreteria.js.
 *
 * Uso:  node apps/backend/scripts/export-catalogo-ferreteria.js [salida.csv]
 */
const fs = require('fs');
const path = require('path');
const { CATALOGO } = require('./data/catalogo-ferreteria');

const COLUMNAS = [
  ['categoria', (p) => p.cat],
  ['nombre', (p) => p.name],
  ['sku', (p) => p.sku],
  ['codigo_barras', (p) => p.barcode],
  ['unidad', (p) => p.unit],
  ['existencia', (p) => p.stock],
  ['minimo', (p) => p.min],
  ['costo', (p) => p.cost],
  ['precio_publico', (p) => p.publico],
  ['precio_contratista', (p) => p.contratista],
  ['margen_publico_pct', (p) => (((p.publico - p.cost) / p.publico) * 100).toFixed(1)],
  ['ubicacion', (p) => p.bin],
  ['unidades_por_empaque', (p) => p.unitsPerPackage ?? ''],
  ['mayoreo_desde', (p) => (p.tier ? p.tier.minQty : '')],
  ['mayoreo_precio', (p) => (p.tier ? p.tier.price : '')],
];

/** Excel en español abre el CSV con `;` sin pedir asistente de importación. */
const SEP = ';';

function celda(v) {
  const s = String(v ?? '');
  // Las comillas se escapan duplicándolas (RFC 4180); entrecomillamos solo si
  // hace falta para no ensuciar el archivo.
  return /["\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const salida = process.argv[2] || path.join(process.cwd(), 'catalogo-ferreteria.csv');
const lineas = [
  COLUMNAS.map(([n]) => n).join(SEP),
  ...CATALOGO.map((p) => COLUMNAS.map(([, fn]) => celda(fn(p))).join(SEP)),
];

// BOM UTF-8: sin él, Excel en Windows destroza los acentos ("Plomería" → "PlomerÃ­a").
fs.writeFileSync(salida, '﻿' + lineas.join('\r\n') + '\r\n', 'utf8');

console.log(`✅ ${CATALOGO.length} artículos → ${salida}`);
