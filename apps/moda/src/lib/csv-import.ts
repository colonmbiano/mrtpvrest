// Parser e import de catálogo por CSV (Fase: alta masiva de SKUs).
//
// El front parsea el archivo aquí y manda filas ya tipadas al backend
// (POST /api/retail/v1/catalog/import), que agrupa por producto y hace upsert por
// SKU. Mantener el parseo del lado del cliente evita subir archivos y permite
// previsualizar/validar antes de enviar. Módulo puro (sin React) para poder probarlo.

export type ImportRow = {
  producto: string;
  categoria?: string;
  marca?: string;
  sku: string;
  codigo_barras?: string;
  precio: number;
  costo?: number;
  talla?: string;
  color?: string;
  material?: string;
  estilo?: string;
  unidad?: string;
  piezas_por_caja?: number;
  ubicacion?: string;
  proveedor?: string;
};

export type ParseError = { line: number; message: string };
export type ParseResult = { rows: ImportRow[]; errors: ParseError[]; headerWarnings: string[] };

export const UNITS = ["PZA", "MTS", "KG", "LTS", "CAJA", "BULTO", "CUBETA", "PAQUETE"] as const;

// Columnas canónicas (coinciden con el endpoint de import del backend).
export const COLUMNS = [
  "producto", "categoria", "marca", "sku", "codigo_barras", "precio", "costo",
  "talla", "color", "material", "estilo", "unidad", "piezas_por_caja", "ubicacion", "proveedor",
] as const;
type Col = (typeof COLUMNS)[number];

const REQUIRED: Col[] = ["producto", "sku", "precio"];
const NUMERIC: Col[] = ["precio", "costo", "piezas_por_caja"];

// Normaliza un encabezado (minúsculas, sin acentos, espacios→_) y lo mapea a una
// columna canónica. Acepta sinónimos comunes y las etiquetas por giro (medida→talla,
// rosca→estilo, etc.) para que cada tienda use el encabezado que ya conoce.
const ALIASES: Record<string, Col> = {
  producto: "producto", nombre: "producto", descripcion: "producto",
  categoria: "categoria", cat: "categoria",
  marca: "marca",
  sku: "sku", clave: "sku", codigo: "sku",
  codigo_barras: "codigo_barras", barcode: "codigo_barras", ean: "codigo_barras", codigodebarras: "codigo_barras",
  precio: "precio", precio_venta: "precio", venta: "precio",
  costo: "costo", costo_compra: "costo", compra: "costo",
  talla: "talla", medida: "talla", size: "talla",
  color: "color", presentacion: "color",
  material: "material", linea: "material",
  estilo: "estilo", rosca: "estilo", lado: "estilo", style: "estilo",
  unidad: "unidad", unidad_medida: "unidad", um: "unidad",
  piezas_por_caja: "piezas_por_caja", unidades_por_caja: "piezas_por_caja", por_caja: "piezas_por_caja",
  ubicacion: "ubicacion", bin: "ubicacion",
  proveedor: "proveedor", sku_proveedor: "proveedor",
};

function normalizeHeader(h: string): Col | null {
  const key = h.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/\s+/g, "_");
  return ALIASES[key] ?? null;
}

// Divide una línea CSV respetando comillas dobles ("a,b" como un solo campo) y
// comillas escapadas ("").
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur); cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function toNumber(raw: string): number | null {
  if (raw === "") return null;
  // Tolera separador de miles y símbolo de moneda: "1,299.50" / "$89".
  const cleaned = raw.replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** Parsea el texto de un CSV a filas tipadas, reportando errores por línea. */
export function parseCatalogCsv(text: string): ParseResult {
  const errors: ParseError[] = [];
  const headerWarnings: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/).filter(l => l.trim() !== "");
  if (lines.length === 0) return { rows: [], errors: [{ line: 0, message: "El archivo está vacío." }], headerWarnings };

  const rawHeaders = splitCsvLine(lines[0]);
  const map: (Col | null)[] = rawHeaders.map(normalizeHeader);
  const present = new Set(map.filter(Boolean) as Col[]);
  for (const req of REQUIRED) {
    if (!present.has(req)) errors.push({ line: 1, message: `Falta la columna obligatoria "${req}".` });
  }
  rawHeaders.forEach((h, i) => { if (h && !map[i]) headerWarnings.push(h); });
  if (errors.length) return { rows: [], errors, headerWarnings };

  const rows: ImportRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = splitCsvLine(lines[li]);
    const rec: Record<string, string> = {};
    map.forEach((col, idx) => { if (col) rec[col] = (cells[idx] ?? "").trim(); });

    let rowError = false;
    for (const req of REQUIRED) {
      if (!rec[req]) { errors.push({ line: li + 1, message: `Fila ${li + 1}: falta "${req}".` }); rowError = true; }
    }
    const nums: Partial<Record<Col, number>> = {};
    for (const col of NUMERIC) {
      if (rec[col]) {
        const n = toNumber(rec[col]);
        if (n === null) continue;
        if (Number.isNaN(n) || n < 0) { errors.push({ line: li + 1, message: `Fila ${li + 1}: "${col}" inválido ("${rec[col]}").` }); rowError = true; }
        else nums[col] = n;
      }
    }
    if (rec.unidad) {
      const u = rec.unidad.toUpperCase();
      if (!(UNITS as readonly string[]).includes(u)) { errors.push({ line: li + 1, message: `Fila ${li + 1}: unidad "${rec.unidad}" no válida (usa ${UNITS.join("/")}).` }); rowError = true; }
      else rec.unidad = u;
    }
    if (rowError) continue;

    const row: ImportRow = { producto: rec.producto, sku: rec.sku, precio: nums.precio ?? 0 };
    if (rec.categoria) row.categoria = rec.categoria;
    if (rec.marca) row.marca = rec.marca;
    if (rec.codigo_barras) row.codigo_barras = rec.codigo_barras;
    if (nums.costo !== undefined) row.costo = nums.costo;
    for (const a of ["talla", "color", "material", "estilo", "ubicacion", "proveedor"] as const) {
      if (rec[a]) (row as Record<string, unknown>)[a] = rec[a];
    }
    if (rec.unidad) row.unidad = rec.unidad;
    if (nums.piezas_por_caja !== undefined) row.piezas_por_caja = nums.piezas_por_caja;
    rows.push(row);
  }
  return { rows, errors, headerWarnings };
}

// Plantilla (encabezados + dos filas de ejemplo): es un archivo estático en
// public/, no se genera en el cliente. Así la misma URL sirve para la descarga en
// web y para abrirla desde el APK, donde el WebView no puede guardar un Blob. Si
// cambian las COLUMNS, actualizar también ese archivo.
export const TEMPLATE_FILE = "plantilla-catalogo.csv";
export const TEMPLATE_PATH = `/${TEMPLATE_FILE}`;

export const IMPORT_BATCH_SIZE = 500;
