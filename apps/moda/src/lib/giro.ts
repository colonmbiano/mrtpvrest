// Catálogo de giros de Retail+ (antes MODA+, solo ropa).
//
// El giro decide QUÉ atributos tiene un SKU y CÓMO se llaman en la UI, sin
// forkear la app. `RetailSku` ya trae 4 columnas genéricas (size/color/material/
// style, todas nullable): aquí se reetiquetan por giro en vez de agregar
// columnas por vertical.
//
// Por qué en código y no en BD (ver docs/plan-retail-multigiro.md): el
// diccionario es estático y conocido en build time. Meterlo en tabla costaría
// migración + endpoints + CRUD a cambio de nada.

export type Giro = "ROPA" | "FERRETERIA" | "REFACCIONARIA";

/** Columna real de `RetailSku` que respalda un atributo del giro. */
export type SkuAttrKey = "size" | "color" | "material" | "style";

export interface GiroAttr {
  key: SkuAttrKey;
  label: string;
  /** Valores sugeridos en el admin. Lista abierta: el campo es texto libre. */
  suggest?: string[];
  /** Pinta swatch de color en vez de texto (solo aplica a ropa). */
  swatch?: boolean;
}

export interface GiroConfig {
  id: Giro;
  label: string;
  /** Nombre de ícono de lucide-react. */
  icon: string;
  attrs: GiroAttr[];
  /**
   * Ropa vende una matriz talla×color por producto; ferretería y refaccionaria
   * venden el SKU directo. Cambia la forma del catálogo en `mapCatalogToProducts`.
   */
  useVariantMatrix: boolean;
  /** Ferretería: unidad de medida + granel + conversión caja↔pza. */
  unitOfMeasure: boolean;
  /** Ferretería: precio por volumen (Fase 3). */
  wholesale: boolean;
  /** Refaccionaria: compatibilidad marca-modelo-año (Fase 4). */
  fitment: boolean;
  /** Refaccionaria: equivalencias de número de parte (Fase 4). */
  crossRef: boolean;
  productPlaceholder: string;
  skuPlaceholder: string;
}

// Tonos de muestra por nombre de color, para pintar el thumbnail aunque el
// backend no mande imagen. Solo lo usa ROPA (único giro con swatch).
export const TONE: Record<string, string> = {
  Beige: "#efe7da", Blanco: "#f4f4f1", "Verde Olivo": "#5a6b3e", Negro: "#23262a",
  Gris: "#e9eaec", "Azul Claro": "#dde6f0", Camel: "#e9d8c2", Perla: "#efece2",
  Canela: "#e6cdb2", Azul: "#cdd9ea", Rojo: "#e9c9c4", Verde: "#cfe0c4",
};

export const toneFor = (color?: string | null): string => (color && TONE[color]) || "#e9eaec";

export const GIROS: Record<Giro, GiroConfig> = {
  ROPA: {
    id: "ROPA",
    label: "Ropa",
    icon: "Shirt",
    attrs: [
      { key: "size", label: "Talla", suggest: ["XS", "S", "M", "L", "XL", "XXL"] },
      { key: "color", label: "Color", suggest: Object.keys(TONE), swatch: true },
      { key: "material", label: "Material", suggest: ["Algodón", "Lino", "Mezclilla", "Satén"] },
    ],
    useVariantMatrix: true,
    unitOfMeasure: false,
    wholesale: false,
    fitment: false,
    crossRef: false,
    productPlaceholder: "Camisa Oxford Slim",
    skuPlaceholder: "CAM-OXF-001",
  },
  FERRETERIA: {
    id: "FERRETERIA",
    label: "Ferretería",
    icon: "Wrench",
    attrs: [
      { key: "size", label: "Medida", suggest: ['1/4"', '3/8"', '1/2"', '3/4"', '1"'] },
      { key: "style", label: "Rosca", suggest: ["Estándar", "Fina", "NPT", "Milimétrica"] },
      { key: "material", label: "Material", suggest: ["Acero", "Galvanizado", "Inoxidable", "Latón", "PVC", "Cobre"] },
      { key: "color", label: "Presentación", suggest: ["Pieza", "Caja", "Blíster", "Granel"] },
    ],
    useVariantMatrix: false,
    unitOfMeasure: true,
    wholesale: true,
    fitment: false,
    crossRef: false,
    productPlaceholder: 'Tornillo hexagonal 1/4" x 2"',
    skuPlaceholder: "TOR-HEX-14-2",
  },
  REFACCIONARIA: {
    id: "REFACCIONARIA",
    label: "Refaccionaria",
    icon: "Car",
    attrs: [
      { key: "size", label: "Posición", suggest: ["Delantera", "Trasera", "Superior", "Inferior"] },
      { key: "style", label: "Lado", suggest: ["Izquierdo", "Derecho", "Ambos"] },
      { key: "material", label: "Línea", suggest: ["OEM", "Genérico", "Premium"] },
      { key: "color", label: "Marca", suggest: [] },
    ],
    useVariantMatrix: false,
    unitOfMeasure: false,
    wholesale: true,
    fitment: true,
    crossRef: true,
    productPlaceholder: "Balata delantera cerámica",
    skuPlaceholder: "BAL-DEL-CER-01",
  },
};

export const DEFAULT_GIRO: Giro = "ROPA";

export function isGiro(v: unknown): v is Giro {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(GIROS, v);
}

export function giroConfig(g: Giro): GiroConfig {
  return GIROS[g] ?? GIROS[DEFAULT_GIRO];
}

/**
 * Valores sugeridos del atributo que respalda la columna `size`.
 * Sustituye al viejo `SIZES = ["XS","S","M","L","XL"]` hardcodeado, que estaba
 * duplicado en retail.ts y en page.jsx.
 */
export function sizesFor(g: Giro): string[] {
  const attr = giroConfig(g).attrs.find((a) => a.key === "size");
  return attr?.suggest ?? [];
}

/** Etiqueta de una columna de SKU según el giro (p. ej. size → "Medida"). */
export function attrLabel(g: Giro, key: SkuAttrKey): string | null {
  return giroConfig(g).attrs.find((a) => a.key === key)?.label ?? null;
}

/**
 * Unidades de medida válidas. Debe coincidir con el z.enum del backend.
 *
 * `unitOfMeasure` es la **unidad base**: en ella se cuenta el stock Y se expresa
 * el precio. `unitsPerPackage` dice cuántas unidades base trae una caja, lo que
 * habilita *capturar* por caja — pero la cantidad que viaja al backend siempre va
 * en unidad base. La conversión vive en el borde de captura a propósito: el
 * contrato del API ("cantidad en unidad base") es el que ya asumen el stock, los
 * movimientos, las líneas de venta y los escalones de mayoreo, y convertir en dos
 * capas invitaría a una doble conversión silenciosa.
 */
export const UNITS = ["PZA", "MTS", "KG", "LTS", "CAJA"] as const;
export type Unit = (typeof UNITS)[number];

/** Unidades que se venden fraccionadas (habilitan cantidad decimal en el POS). */
const BULK_UNITS: ReadonlySet<string> = new Set(["MTS", "KG", "LTS"]);

export function isBulkUnit(u?: string | null): boolean {
  return Boolean(u && BULK_UNITS.has(u));
}

/**
 * ¿Se puede capturar por caja? Hace falta saber cuántas unidades base trae, y que
 * la unidad base no sea YA la caja (ahí "por caja" sería la identidad: el stock
 * se cuenta en cajas y `unitsPerPackage` solo informa qué trae adentro).
 */
export function canEnterByPackage(unit?: string | null, unitsPerPackage?: number | null): boolean {
  return Boolean(unitsPerPackage && unitsPerPackage > 0 && unit !== "CAJA");
}

/** Cajas → unidad base. */
export function packagesToBase(packages: number, unitsPerPackage: number): number {
  return round3(packages * unitsPerPackage);
}

/** Unidad base → cajas (para mostrar en el input cuando se captura por caja). */
export function baseToPackages(base: number, unitsPerPackage: number): number {
  if (!unitsPerPackage) return base;
  return round3(base / unitsPerPackage);
}

/** Las cantidades son Decimal(12,3) en la BD: redondear igual evita que un
 *  0.1+0.2 de coma flotante se mande como 0.30000000000000004. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
