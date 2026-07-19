/**
 * Catálogo de ferretería — 100 artículos.
 *
 * Vive aparte del seed para poder crecer sin tocar la lógica de siembra, y para
 * que se pueda exportar a CSV (scripts/export-catalogo-ferreteria.js) e importar
 * en otro tenant.
 *
 * Los 12 primeros son los del PDF del demo comercial y NO se tocan: sus códigos
 * de barras salen en el guion de la presentación y en el E2E
 * (tests/e2e/08-moda-ferreteria.spec.ts escanea 7500000000011). Del 13 en
 * adelante son artículos típicos de una ferretería mexicana con precios de
 * referencia 2026 — ficticios, hay que ajustarlos al prospecto.
 *
 * Campos:
 *   cat, name, sku, barcode, unit, stock, publico, contratista, cost, bin, min
 *   unitsPerPackage  conversión al capturar por empaque (rollo/caja/millar)
 *   tier             { minQty, price } precio de mayoreo a partir de N unidades
 *
 * Unidades válidas (apps/moda/src/lib/giro.ts): PZA MTS KG LTS CAJA BULTO
 * CUBETA PAQUETE. Solo MTS/KG/LTS aceptan cantidad decimal (granel).
 */

/** Dígito verificador EAN-13. Un código inválido lo rechaza cualquier lector. */
function ean13(base12) {
  const d = String(base12).padStart(12, '0').slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  return d + ((10 - (sum % 10)) % 10);
}

/** 750 = prefijo GS1 de México. Serie propia para los artículos nuevos. */
let seq = 5000;
const bc = () => ean13('750' + String(++seq).padStart(9, '0'));

// ── Los 12 del demo comercial (PDF). Códigos y precios congelados. ───────────
const DEMO_PDF = [
  { cat: 'Construcción', name: 'Cemento gris 50 kg', sku: 'CON-CEM-50', barcode: '7500000000011',
    unit: 'BULTO', stock: 185, publico: 265, contratista: 249, cost: 218, bin: 'Patio A - Tarima 01', min: 40 },
  { cat: 'Construcción', name: 'Mortero 50 kg', sku: 'CON-MOR-50', barcode: '7500000000028',
    unit: 'BULTO', stock: 74, publico: 190, contratista: 179, cost: 155, bin: 'Patio A - Tarima 02', min: 20 },
  { cat: 'Construcción', name: 'Varilla 3/8" de 12 m', sku: 'CON-VAR-38', barcode: '7500000000035',
    unit: 'PZA', stock: 96, publico: 198, contratista: 187, cost: 162, bin: 'Patio B - Rack 01', min: 30 },
  { cat: 'Electricidad', name: 'Cable THW calibre 12', sku: 'ELE-CAB-THW12', barcode: '750000000101',
    unit: 'MTS', stock: 640, publico: 18, contratista: 16.5, cost: 11.5, bin: 'Pasillo E - Anaquel 03', min: 150,
    unitsPerPackage: 100 },
  { cat: 'Plomería', name: 'Tubo PVC 1/2 pulgada', sku: 'PLO-PVC-12', barcode: '7500000000059',
    unit: 'PZA', stock: 43, publico: 89, contratista: 82, cost: 68, bin: 'Pasillo C - Anaquel 05', min: 15 },
  { cat: 'Tornillería', name: 'Tornillo para madera', sku: 'TOR-MAD-KG', barcode: '7500000000066',
    unit: 'KG', stock: 38.5, publico: 115, contratista: 104, cost: 84, bin: 'Pasillo B - Anaquel 02', min: 10,
    tier: { minQty: 25, price: 96 } },
  { cat: 'Pinturas', name: 'Pintura blanca 19 L', sku: 'PIN-BLA-19', barcode: '7500000000073',
    unit: 'CUBETA', stock: 27, publico: 1249, contratista: 1159, cost: 980, bin: 'Pasillo F - Anaquel 01', min: 8 },
  { cat: 'Pinturas', name: 'Impermeabilizante 19 L', sku: 'PIN-IMP-19', barcode: '7500000000080',
    unit: 'CUBETA', stock: 16, publico: 1590, contratista: 1470, cost: 1240, bin: 'Pasillo F - Anaquel 02', min: 6 },
  { cat: 'Herramientas manuales', name: 'Martillo 16 oz', sku: 'HER-MAR-16', barcode: '7500000000097',
    unit: 'PZA', stock: 22, publico: 249, contratista: 225, cost: 178, bin: 'Pasillo A - Anaquel 04', min: 6 },
  { cat: 'Herramientas eléctricas', name: 'Taladro inalámbrico', sku: 'HER-TAL-INA', barcode: '7500000000103',
    unit: 'PZA', stock: 8, publico: 2399, contratista: 2199, cost: 1850, bin: 'Vitrina 01', min: 3 },
  { cat: 'Herramientas manuales', name: 'Cinta métrica 5 m', sku: 'HER-CIN-5', barcode: '7500000000110',
    unit: 'PZA', stock: 34, publico: 129, contratista: 115, cost: 88, bin: 'Pasillo A - Anaquel 01', min: 10 },
  { cat: 'Plomería', name: 'Llave mezcladora', sku: 'PLO-LLA-MEZ', barcode: '7500000000127',
    unit: 'PZA', stock: 12, publico: 849, contratista: 790, cost: 640, bin: 'Pasillo C - Anaquel 01', min: 4 },
];

// ── Artículos nuevos ─────────────────────────────────────────────────────────
// `contratista` se deriva del público con el descuento de la categoría (ver
// DESCUENTO abajo); se pone explícito solo donde el margen no lo aguanta.
const NUEVOS = [
  // ---------- Construcción ----------
  { cat: 'Construcción', name: 'Cal hidratada 25 kg', sku: 'CON-CAL-25', unit: 'BULTO', stock: 58, publico: 132, cost: 104, bin: 'Patio A - Tarima 04', min: 15 },
  { cat: 'Construcción', name: 'Yeso 40 kg', sku: 'CON-YES-40', unit: 'BULTO', stock: 41, publico: 158, cost: 126, bin: 'Patio A - Tarima 05', min: 12 },
  { cat: 'Construcción', name: 'Block hueco 12x20x40', sku: 'CON-BLO-12', unit: 'PZA', stock: 940, publico: 17.5, cost: 13.2, bin: 'Patio C - Tarima 01', min: 200, tier: { minQty: 200, price: 15.5 } },
  { cat: 'Construcción', name: 'Tabique rojo recocido', sku: 'CON-TAB-ROJ', unit: 'PZA', stock: 1250, publico: 6.8, cost: 5.1, bin: 'Patio C - Tarima 02', min: 300, tier: { minQty: 500, price: 5.9 } },
  { cat: 'Construcción', name: 'Varilla 1/2" de 12 m', sku: 'CON-VAR-12', unit: 'PZA', stock: 64, publico: 348, cost: 288, bin: 'Patio B - Rack 02', min: 20 },
  { cat: 'Construcción', name: 'Alambre recocido cal. 16', sku: 'CON-ALA-16', unit: 'KG', stock: 82.5, publico: 38, cost: 29, bin: 'Patio B - Anaquel 01', min: 20, tier: { minQty: 50, price: 33 } },
  { cat: 'Construcción', name: 'Arena de río', sku: 'CON-ARE-M3', unit: 'BULTO', stock: 120, publico: 68, cost: 52, bin: 'Patio D - Granel 01', min: 30 },
  { cat: 'Construcción', name: 'Grava 3/4"', sku: 'CON-GRA-34', unit: 'BULTO', stock: 96, publico: 74, cost: 57, bin: 'Patio D - Granel 02', min: 30 },
  { cat: 'Construcción', name: 'Adhesivo para loseta 20 kg', sku: 'CON-ADH-20', unit: 'BULTO', stock: 10, publico: 189, cost: 152, bin: 'Pasillo G - Anaquel 01', min: 12 },

  // ---------- Electricidad ----------
  { cat: 'Electricidad', name: 'Cable THW calibre 10', sku: 'ELE-CAB-THW10', unit: 'MTS', stock: 420, publico: 27, cost: 18.5, bin: 'Pasillo E - Anaquel 03', min: 100, unitsPerPackage: 100 },
  { cat: 'Electricidad', name: 'Cable THW calibre 14', sku: 'ELE-CAB-THW14', unit: 'MTS', stock: 780, publico: 12.5, cost: 8.2, bin: 'Pasillo E - Anaquel 04', min: 200, unitsPerPackage: 100 },
  { cat: 'Electricidad', name: 'Apagador sencillo', sku: 'ELE-APA-SEN', unit: 'PZA', stock: 86, publico: 42, cost: 28, bin: 'Pasillo E - Anaquel 01', min: 20 },
  { cat: 'Electricidad', name: 'Contacto dúplex polarizado', sku: 'ELE-CON-DUP', unit: 'PZA', stock: 92, publico: 48, cost: 32, bin: 'Pasillo E - Anaquel 01', min: 20 },
  { cat: 'Electricidad', name: 'Foco LED 9 W luz fría', sku: 'ELE-FOC-LED9', unit: 'PZA', stock: 148, publico: 39, cost: 24, bin: 'Pasillo E - Anaquel 02', min: 40, tier: { minQty: 24, price: 33 } },
  { cat: 'Electricidad', name: 'Reflector LED 50 W', sku: 'ELE-REF-50', unit: 'PZA', stock: 21, publico: 385, cost: 285, bin: 'Pasillo E - Anaquel 06', min: 6 },
  { cat: 'Electricidad', name: 'Pastilla termomagnética 20 A', sku: 'ELE-PAS-20', unit: 'PZA', stock: 37, publico: 168, cost: 122, bin: 'Pasillo E - Anaquel 07', min: 10 },
  { cat: 'Electricidad', name: 'Centro de carga 4 polos', sku: 'ELE-CEN-04', unit: 'PZA', stock: 2, publico: 640, cost: 490, bin: 'Pasillo E - Anaquel 08', min: 3 },
  { cat: 'Electricidad', name: 'Tubo conduit PVC 3/4"', sku: 'ELE-CDT-34', unit: 'PZA', stock: 68, publico: 54, cost: 39, bin: 'Pasillo E - Rack 01', min: 20 },
  { cat: 'Electricidad', name: 'Cinta de aislar 18 m', sku: 'ELE-CIN-AIS', unit: 'PZA', stock: 124, publico: 28, cost: 17, bin: 'Pasillo E - Anaquel 02', min: 30, unitsPerPackage: 10 },
  { cat: 'Electricidad', name: 'Extensión eléctrica 5 m', sku: 'ELE-EXT-5', unit: 'PZA', stock: 26, publico: 189, cost: 138, bin: 'Pasillo E - Anaquel 09', min: 8 },

  // ---------- Plomería ----------
  { cat: 'Plomería', name: 'Tubo PVC 3/4 pulgada', sku: 'PLO-PVC-34', unit: 'PZA', stock: 52, publico: 118, cost: 89, bin: 'Pasillo C - Anaquel 05', min: 15 },
  { cat: 'Plomería', name: 'Tubo PVC sanitario 4"', sku: 'PLO-PVC-S4', unit: 'PZA', stock: 34, publico: 268, cost: 205, bin: 'Pasillo C - Rack 01', min: 10 },
  { cat: 'Plomería', name: 'Tubo CPVC 1/2" agua caliente', sku: 'PLO-CPV-12', unit: 'PZA', stock: 38, publico: 142, cost: 108, bin: 'Pasillo C - Anaquel 06', min: 12 },
  { cat: 'Plomería', name: 'Codo PVC 1/2" 90°', sku: 'PLO-COD-12', unit: 'PZA', stock: 210, publico: 9.5, cost: 6.2, bin: 'Pasillo C - Gaveta 01', min: 50, tier: { minQty: 50, price: 8 } },
  { cat: 'Plomería', name: 'Cople PVC 1/2"', sku: 'PLO-COP-12', unit: 'PZA', stock: 195, publico: 8, cost: 5.1, bin: 'Pasillo C - Gaveta 02', min: 50, tier: { minQty: 50, price: 6.8 } },
  { cat: 'Plomería', name: 'Cinta teflón 1/2"', sku: 'PLO-TEF-12', unit: 'PZA', stock: 240, publico: 12, cost: 6.5, bin: 'Pasillo C - Gaveta 04', min: 60, unitsPerPackage: 10 },
  { cat: 'Plomería', name: 'Pegamento PVC 500 ml', sku: 'PLO-PEG-500', unit: 'PZA', stock: 11, publico: 148, cost: 108, bin: 'Pasillo C - Anaquel 02', min: 12 },
  { cat: 'Plomería', name: 'Llave de nariz 1/2"', sku: 'PLO-LLA-NAR', unit: 'PZA', stock: 48, publico: 128, cost: 92, bin: 'Pasillo C - Anaquel 03', min: 15 },
  { cat: 'Plomería', name: 'Manguera de abasto 40 cm', sku: 'PLO-MAN-40', unit: 'PZA', stock: 66, publico: 78, cost: 54, bin: 'Pasillo C - Anaquel 07', min: 20 },
  { cat: 'Plomería', name: 'Flotador para tanque WC', sku: 'PLO-FLO-WC', unit: 'PZA', stock: 31, publico: 145, cost: 104, bin: 'Pasillo C - Anaquel 08', min: 10 },

  // ---------- Tornillería ----------
  { cat: 'Tornillería', name: 'Pija punta broca 8x1"', sku: 'TOR-PIJ-81', unit: 'KG', stock: 46.2, publico: 128, cost: 92, bin: 'Pasillo B - Anaquel 02', min: 12, tier: { minQty: 25, price: 112 } },
  { cat: 'Tornillería', name: 'Clavo para concreto 2"', sku: 'TOR-CLA-CON2', unit: 'KG', stock: 34.8, publico: 96, cost: 68, bin: 'Pasillo B - Anaquel 03', min: 10 },
  { cat: 'Tornillería', name: 'Clavo estándar 2 1/2"', sku: 'TOR-CLA-25', unit: 'KG', stock: 62.4, publico: 52, cost: 36, bin: 'Pasillo B - Anaquel 03', min: 15, tier: { minQty: 25, price: 45 } },
  { cat: 'Tornillería', name: 'Taquete plástico 1/4"', sku: 'TOR-TAQ-14', unit: 'PAQUETE', stock: 78, publico: 34, cost: 21, bin: 'Pasillo B - Gaveta 01', min: 20 },
  { cat: 'Tornillería', name: 'Taquete expansión 3/8"', sku: 'TOR-TAQ-38', unit: 'PZA', stock: 320, publico: 9.5, cost: 6, bin: 'Pasillo B - Gaveta 02', min: 80, tier: { minQty: 100, price: 8 } },
  { cat: 'Tornillería', name: 'Tuerca hexagonal 3/8"', sku: 'TOR-TUE-38', unit: 'KG', stock: 28.5, publico: 88, cost: 62, bin: 'Pasillo B - Gaveta 03', min: 8 },
  { cat: 'Tornillería', name: 'Rondana plana 3/8"', sku: 'TOR-RON-38', unit: 'KG', stock: 22.1, publico: 76, cost: 53, bin: 'Pasillo B - Gaveta 04', min: 8 },
  { cat: 'Tornillería', name: 'Tornillo drywall 1 5/8"', sku: 'TOR-DRY-58', unit: 'KG', stock: 40.6, publico: 118, cost: 84, bin: 'Pasillo B - Anaquel 04', min: 10, tier: { minQty: 25, price: 102 } },
  { cat: 'Tornillería', name: 'Ancla mariposa 1/8"', sku: 'TOR-ANC-18', unit: 'PAQUETE', stock: 12, publico: 46, cost: 30, bin: 'Pasillo B - Gaveta 05', min: 15 },

  // ---------- Pinturas ----------
  { cat: 'Pinturas', name: 'Pintura vinílica 4 L', sku: 'PIN-VIN-4', unit: 'PZA', stock: 62, publico: 389, cost: 296, bin: 'Pasillo F - Anaquel 03', min: 15 },
  { cat: 'Pinturas', name: 'Esmalte alquidálico 1 L', sku: 'PIN-ESM-1', unit: 'PZA', stock: 74, publico: 215, cost: 158, bin: 'Pasillo F - Anaquel 04', min: 20 },
  { cat: 'Pinturas', name: 'Sellador 5 en 1 19 L', sku: 'PIN-SEL-19', unit: 'CUBETA', stock: 4, publico: 1080, cost: 845, bin: 'Pasillo F - Anaquel 03', min: 5 },
  { cat: 'Pinturas', name: 'Thinner estándar 1 L', sku: 'PIN-THI-1', unit: 'LTS', stock: 96, publico: 62, cost: 42, bin: 'Pasillo F - Anaquel 05', min: 25 },
  { cat: 'Pinturas', name: 'Brocha 3 pulgadas', sku: 'PIN-BRO-3', unit: 'PZA', stock: 88, publico: 78, cost: 51, bin: 'Pasillo F - Anaquel 06', min: 25 },
  { cat: 'Pinturas', name: 'Rodillo 9" con felpa', sku: 'PIN-ROD-9', unit: 'PZA', stock: 67, publico: 96, cost: 64, bin: 'Pasillo F - Anaquel 06', min: 20 },
  { cat: 'Pinturas', name: 'Charola para pintura', sku: 'PIN-CHA-STD', unit: 'PZA', stock: 52, publico: 58, cost: 36, bin: 'Pasillo F - Anaquel 07', min: 15 },
  { cat: 'Pinturas', name: 'Cinta masking tape 24 mm', sku: 'PIN-MAS-24', unit: 'PZA', stock: 130, publico: 32, cost: 19, bin: 'Pasillo F - Anaquel 07', min: 40, unitsPerPackage: 12 },

  // ---------- Herramientas manuales ----------
  { cat: 'Herramientas manuales', name: 'Desarmador plano 1/4"', sku: 'HER-DES-PLA', unit: 'PZA', stock: 58, publico: 68, cost: 44, bin: 'Pasillo A - Anaquel 02', min: 15 },
  { cat: 'Herramientas manuales', name: 'Desarmador de cruz #2', sku: 'HER-DES-CRU', unit: 'PZA', stock: 61, publico: 72, cost: 46, bin: 'Pasillo A - Anaquel 02', min: 15 },
  { cat: 'Herramientas manuales', name: 'Juego de desarmadores 6 pzas', sku: 'HER-DES-JG6', unit: 'PZA', stock: 24, publico: 285, cost: 198, bin: 'Pasillo A - Anaquel 02', min: 8 },
  { cat: 'Herramientas manuales', name: 'Pinza de electricista 8"', sku: 'HER-PIN-ELE', unit: 'PZA', stock: 33, publico: 245, cost: 172, bin: 'Pasillo A - Anaquel 03', min: 10 },
  { cat: 'Herramientas manuales', name: 'Pinza de presión 10"', sku: 'HER-PIN-PRE', unit: 'PZA', stock: 27, publico: 268, cost: 189, bin: 'Pasillo A - Anaquel 03', min: 8 },
  { cat: 'Herramientas manuales', name: 'Llave stilson 14"', sku: 'HER-LLA-STI', unit: 'PZA', stock: 16, publico: 465, cost: 338, bin: 'Pasillo A - Anaquel 05', min: 5 },
  { cat: 'Herramientas manuales', name: 'Juego de llaves españolas 8 pzas', sku: 'HER-LLA-JG8', unit: 'PZA', stock: 19, publico: 520, cost: 378, bin: 'Pasillo A - Anaquel 05', min: 6 },
  { cat: 'Herramientas manuales', name: 'Serrucho 22"', sku: 'HER-SER-22', unit: 'PZA', stock: 21, publico: 218, cost: 152, bin: 'Pasillo A - Anaquel 06', min: 6 },
  { cat: 'Herramientas manuales', name: 'Nivel de burbuja 24"', sku: 'HER-NIV-24', unit: 'PZA', stock: 18, publico: 295, cost: 208, bin: 'Pasillo A - Anaquel 01', min: 6 },
  { cat: 'Herramientas manuales', name: 'Flexómetro 8 m', sku: 'HER-FLE-8', unit: 'PZA', stock: 42, publico: 185, cost: 128, bin: 'Pasillo A - Anaquel 01', min: 12 },

  // ---------- Herramientas eléctricas ----------
  { cat: 'Herramientas eléctricas', name: 'Esmeriladora angular 4 1/2"', sku: 'HER-ESM-45', unit: 'PZA', stock: 11, publico: 1290, cost: 985, bin: 'Vitrina 01', min: 3 },
  { cat: 'Herramientas eléctricas', name: 'Rotomartillo 1/2"', sku: 'HER-ROT-12', unit: 'PZA', stock: 7, publico: 2890, cost: 2280, bin: 'Vitrina 01', min: 2 },
  { cat: 'Herramientas eléctricas', name: 'Sierra circular 7 1/4"', sku: 'HER-SIE-CIR', unit: 'PZA', stock: 6, publico: 2150, cost: 1690, bin: 'Vitrina 02', min: 2 },
  { cat: 'Herramientas eléctricas', name: 'Lijadora orbital', sku: 'HER-LIJ-ORB', unit: 'PZA', stock: 9, publico: 1180, cost: 890, bin: 'Vitrina 02', min: 3 },
  { cat: 'Herramientas eléctricas', name: 'Pulidora de banco 6"', sku: 'HER-PUL-BAN', unit: 'PZA', stock: 1, publico: 1980, cost: 1520, bin: 'Vitrina 03', min: 2 },
  { cat: 'Herramientas eléctricas', name: 'Juego de brocas para concreto 5 pzas', sku: 'HER-BRO-CON5', unit: 'PAQUETE', stock: 38, publico: 165, cost: 112, bin: 'Pasillo A - Anaquel 07', min: 12 },
  { cat: 'Herramientas eléctricas', name: 'Disco de corte metal 4 1/2"', sku: 'HER-DIS-MET', unit: 'PZA', stock: 165, publico: 24, cost: 14.5, bin: 'Pasillo A - Anaquel 07', min: 50, tier: { minQty: 25, price: 20 } },

  // ---------- Cerrajería ----------
  { cat: 'Cerrajería', name: 'Candado de acero 40 mm', sku: 'CER-CAN-40', unit: 'PZA', stock: 56, publico: 118, cost: 78, bin: 'Pasillo D - Anaquel 01', min: 15 },
  { cat: 'Cerrajería', name: 'Candado de acero 60 mm', sku: 'CER-CAN-60', unit: 'PZA', stock: 34, publico: 218, cost: 152, bin: 'Pasillo D - Anaquel 01', min: 10 },
  { cat: 'Cerrajería', name: 'Chapa de perilla latón', sku: 'CER-CHA-PER', unit: 'PZA', stock: 23, publico: 385, cost: 275, bin: 'Pasillo D - Anaquel 02', min: 8 },
  { cat: 'Cerrajería', name: 'Bisagra 3 1/2" acero', sku: 'CER-BIS-35', unit: 'PZA', stock: 118, publico: 38, cost: 24, bin: 'Pasillo D - Gaveta 01', min: 30 },
  { cat: 'Cerrajería', name: 'Cadena galvanizada 1/4"', sku: 'CER-CAD-14', unit: 'MTS', stock: 96.5, publico: 42, cost: 28, bin: 'Pasillo D - Rack 01', min: 25 },
  { cat: 'Cerrajería', name: 'Porta candado reforzado', sku: 'CER-POR-CAN', unit: 'PZA', stock: 41, publico: 92, cost: 62, bin: 'Pasillo D - Anaquel 03', min: 12 },

  // ---------- Adhesivos y selladores ----------
  { cat: 'Adhesivos y selladores', name: 'Silicón transparente 280 ml', sku: 'ADH-SIL-280', unit: 'PZA', stock: 92, publico: 68, cost: 44, bin: 'Pasillo G - Anaquel 02', min: 25 },
  { cat: 'Adhesivos y selladores', name: 'Pegamento blanco 1 kg', sku: 'ADH-PEG-1K', unit: 'PZA', stock: 48, publico: 96, cost: 66, bin: 'Pasillo G - Anaquel 02', min: 15 },
  { cat: 'Adhesivos y selladores', name: 'Cinta canela 48 mm', sku: 'ADH-CIN-CAN', unit: 'PZA', stock: 156, publico: 26, cost: 15, bin: 'Pasillo G - Anaquel 03', min: 40, unitsPerPackage: 12 },
  { cat: 'Adhesivos y selladores', name: 'Espuma de poliuretano 500 ml', sku: 'ADH-ESP-500', unit: 'PZA', stock: 27, publico: 168, cost: 118, bin: 'Pasillo G - Anaquel 03', min: 8 },
  { cat: 'Adhesivos y selladores', name: 'Pegamento de contacto 250 ml', sku: 'ADH-CTO-250', unit: 'PZA', stock: 61, publico: 58, cost: 38, bin: 'Pasillo G - Anaquel 04', min: 20 },
  { cat: 'Adhesivos y selladores', name: 'Pistola para silicón', sku: 'ADH-PIS-SIL', unit: 'PZA', stock: 35, publico: 89, cost: 58, bin: 'Pasillo G - Anaquel 04', min: 10 },

  // ---------- Seguridad ----------
  { cat: 'Seguridad', name: 'Guantes de carnaza', sku: 'SEG-GUA-CAR', unit: 'PZA', stock: 74, publico: 78, cost: 50, bin: 'Pasillo H - Anaquel 01', min: 20 },
  { cat: 'Seguridad', name: 'Lentes de seguridad claros', sku: 'SEG-LEN-CLA', unit: 'PZA', stock: 88, publico: 52, cost: 32, bin: 'Pasillo H - Anaquel 01', min: 25 },
  { cat: 'Seguridad', name: 'Casco de seguridad', sku: 'SEG-CAS-STD', unit: 'PZA', stock: 29, publico: 168, cost: 118, bin: 'Pasillo H - Anaquel 02', min: 10 },
  { cat: 'Seguridad', name: 'Cubrebocas N95', sku: 'SEG-CUB-N95', unit: 'PZA', stock: 210, publico: 18, cost: 10, bin: 'Pasillo H - Gaveta 01', min: 50, tier: { minQty: 50, price: 15 } },
  { cat: 'Seguridad', name: 'Faja lumbar ajustable', sku: 'SEG-FAJ-LUM', unit: 'PZA', stock: 17, publico: 245, cost: 168, bin: 'Pasillo H - Anaquel 02', min: 6 },
  { cat: 'Seguridad', name: 'Extintor PQS 4.5 kg', sku: 'SEG-EXT-45', unit: 'PZA', stock: 3, publico: 685, cost: 495, bin: 'Pasillo H - Anaquel 03', min: 4 },

  // ---------- Jardín ----------
  { cat: 'Jardín', name: 'Manguera reforzada 1/2" x 15 m', sku: 'JAR-MAN-15', unit: 'PZA', stock: 26, publico: 385, cost: 278, bin: 'Pasillo I - Anaquel 01', min: 8 },
  { cat: 'Jardín', name: 'Pala cuadrada con mango', sku: 'JAR-PAL-CUA', unit: 'PZA', stock: 22, publico: 268, cost: 188, bin: 'Pasillo I - Rack 01', min: 8 },
  { cat: 'Jardín', name: 'Rastrillo 14 dientes', sku: 'JAR-RAS-14', unit: 'PZA', stock: 19, publico: 195, cost: 136, bin: 'Pasillo I - Rack 01', min: 6 },
  { cat: 'Jardín', name: 'Carretilla 90 L', sku: 'JAR-CAR-90', unit: 'PZA', stock: 2, publico: 1285, cost: 985, bin: 'Patio E - Piso', min: 3 },
  { cat: 'Jardín', name: 'Tijeras para podar', sku: 'JAR-TIJ-POD', unit: 'PZA', stock: 24, publico: 178, cost: 122, bin: 'Pasillo I - Anaquel 02', min: 8 },
  { cat: 'Jardín', name: 'Aspersor giratorio', sku: 'JAR-ASP-GIR', unit: 'PZA', stock: 31, publico: 118, cost: 78, bin: 'Pasillo I - Anaquel 02', min: 10 },
];

/** Descuento de contratista por categoría. Las de margen delgado (material a
 *  granel de obra) descuentan menos que las de herramienta. */
const DESCUENTO = {
  'Construcción': 0.06,
  'Electricidad': 0.07,
  'Plomería': 0.07,
  'Tornillería': 0.08,
  'Pinturas': 0.08,
  'Herramientas manuales': 0.09,
  'Herramientas eléctricas': 0.08,
  'Cerrajería': 0.08,
  'Adhesivos y selladores': 0.08,
  'Seguridad': 0.08,
  'Jardín': 0.08,
};

const round2 = (n) => Math.round(n * 100) / 100;

/** Redondeo comercial: una lista de precios se imprime y se dicta por teléfono,
 *  así que 595.20 se ve mal y 26.04 peor. Los artículos baratos van al medio
 *  peso —redondearlos al peso mueve el precio hasta un 8%— y de $100 en
 *  adelante, al peso. */
function precioComercial(n) {
  if (n < 20) return Math.round(n * 2) / 2;
  if (n < 100) return Math.round(n);
  return Math.round(n);
}

function contratistaDe(p) {
  if (p.contratista != null) return p.contratista;
  const objetivo = precioComercial(p.publico * (1 - (DESCUENTO[p.cat] ?? 0.08)));
  // Nunca por debajo del costo: el redondeo o un margen corto pueden cruzarlo, y
  // vender bajo costo no es una promoción. El piso deja 4% sobre el costo.
  const piso = round2(p.cost * 1.04);
  return Math.max(objetivo, piso);
}

const CATALOGO = [
  ...DEMO_PDF,
  ...NUEVOS.map((p) => ({ ...p, barcode: p.barcode || bc(), contratista: contratistaDe(p) })),
];

module.exports = { CATALOGO, ean13 };
