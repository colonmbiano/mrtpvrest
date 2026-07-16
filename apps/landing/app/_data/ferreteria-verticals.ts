// Giros finos de ferretería. Misma forma que moda-verticals.ts (el patrón de
// /moda/[giro]), pero bajo la marca madre mrtpvrest en /ferreteria/[giro] — no
// bajo MODA+, que es el POS de ropa y cuyo breadcrumb JSON-LD declara
// "punto de venta para ropa".
//
// Jerarquía: /ferreteria es el giro AMPLIO (= RestaurantConfig.retailGiro
// 'FERRETERIA', el que decide el modelo de atributos del SKU en la app) y estos
// son los giros FINOS, que son los que capturan el long tail de búsqueda.
// Ver docs/plan-retail-multigiro.md.
//
// El copy describe SOLO lo que el producto hace hoy: escaneo por código de
// barras, venta a granel por metro/kilo/litro, precio por mayoreo por escalón,
// captura por caja (N cajas → N × unitsPerPackage unidades base, al vender,
// contar y traspasar), ubicación en anaquel, corte de caja por turno y operación
// sin internet.
export type FerreteriaVertical = {
  slug: string
  nav: string
  metaTitle: string
  metaDescription: string
  eyebrow: string
  h1: string
  intro: string
  highlights: { title: string; text: string }[]
  pains: [string, string, string][]
  faqs: [string, string][]
}

export const ferreteriaVerticals: FerreteriaVertical[] = [
  {
    slug: 'tlapaleria',
    nav: 'Tlapalería',
    metaTitle: 'Punto de Venta para Tlapalería | mrtpvrest',
    metaDescription:
      'Punto de venta para tlapalería: miles de claves con código de barras, venta por pieza o a granel, precio de mayoreo y corte de caja. Windows, Android y web.',
    eyebrow: 'Giro · Tlapalería',
    h1: 'El punto de venta para tu tlapalería',
    intro:
      'Una tlapalería vive de miles de claves chiquitas que se parecen entre sí. Cobra escaneando el código de barras, vende por pieza o a granel, guarda en qué pasillo y anaquel está cada cosa, y cuadra tu caja por turno. En tu computadora o celular, aunque se caiga el internet.',
    highlights: [
      { title: 'Cobra escaneando', text: 'La pistola resuelve el artículo por código de barras: sin teclear claves ni equivocarte de medida.' },
      { title: 'Por pieza o a granel', text: 'Vende por pieza, metro, kilo o litro. La cantidad admite decimales, así que 2.5 m de cable se cobra como 2.5 m.' },
      { title: 'Precio de mayoreo', text: 'Define que de cierta cantidad en adelante baja el precio. El sistema aplica el escalón solo, sin que el mostrador calcule nada.' },
      { title: 'Dónde está cada cosa', text: 'Guarda pasillo y anaquel por artículo y búscalo por ubicación cuando el cliente pregunta.' },
    ],
    pains: [
      ['Claves que nadie recuerda', 'El mostrador teclea la clave a mano y se equivoca de medida.', 'Escaneas el código y sale el artículo exacto.'],
      ['Granel a ojo', 'El cable por metro se cobra redondeando y se pierde margen.', 'Cantidad con decimales: 2.5 m se cobra 2.5 m.'],
      ['Mayoreo en calculadora', 'El descuento por volumen depende de quién atienda.', 'El escalón de precio lo aplica el sistema, igual para todos.'],
    ],
    faqs: [
      ['¿Puedo vender cable por metro o tornillos por kilo?', 'Sí. Cada artículo tiene su unidad (pieza, metro, kilo, litro o caja) y la cantidad acepta decimales, así que puedes cobrar 2.5 m o 0.75 kg.'],
      ['¿Maneja precio de mayoreo?', 'Sí. Defines a partir de qué cantidad aplica cada precio y el sistema resuelve el escalón al cobrar.'],
      ['¿Funciona sin internet?', 'Sí. Se instala en Windows y Android y sigue cobrando aunque se caiga la conexión; sincroniza cuando vuelve.'],
    ],
  },
  {
    slug: 'material-electrico',
    nav: 'Material eléctrico',
    metaTitle: 'Punto de Venta para Material Eléctrico | mrtpvrest',
    metaDescription:
      'Punto de venta para tienda de material eléctrico: cable por metro, calibres y medidas, precio de mayoreo y código de barras. Windows, Android y web.',
    eyebrow: 'Giro · Material eléctrico',
    h1: 'El punto de venta para tu tienda de material eléctrico',
    intro:
      'En material eléctrico casi todo se vende por metro y el calibre cambia el precio. Cobra el cable por metro con decimales, guarda calibre y medida como atributos del artículo, aplica precio de mayoreo al instalador y cuadra tu caja por turno.',
    highlights: [
      { title: 'Cable por metro, con decimales', text: 'Cobra 12.5 m de cable como 12.5 m. La cantidad no se redondea a piezas.' },
      { title: 'Calibre y medida', text: 'Cada artículo lleva sus atributos (calibre, medida, material) y el catálogo los muestra con esos nombres, no como "talla" y "color".' },
      { title: 'Precio para el instalador', text: 'Escalones de precio por cantidad: el que lleva rollo paga precio de rollo, automático.' },
      { title: 'Corte de caja que cuadra', text: 'Abre turno, registra entradas, salidas y gastos, y cierra con esperado contra contado.' },
    ],
    pains: [
      ['Metro redondeado a pieza', 'El POS genérico solo cuenta piezas enteras.', 'Cantidad decimal real por metro, kilo o litro.'],
      ['Precio de instalador a criterio', 'Cada quien da el descuento que se le ocurre.', 'Escalón por cantidad, aplicado por el sistema.'],
      ['Inventario que no cuadra', 'El granel se descuenta mal y el stock miente.', 'El descuento de stock usa la misma cantidad decimal que cobraste.'],
    ],
    faqs: [
      ['¿Puedo cobrar cable por metro?', 'Sí. Marcas el artículo con unidad "metros" y capturas la cantidad con decimales al vender.'],
      ['¿Puedo dar precio distinto al instalador?', 'Sí, por volumen: defines a partir de qué cantidad baja el precio y el sistema lo aplica al cobrar.'],
      ['¿Sirve en tablet o celular?', 'Sí. Funciona en Windows, Android y web, y sigue cobrando sin internet.'],
    ],
  },
  {
    slug: 'plomeria',
    nav: 'Plomería',
    metaTitle: 'Punto de Venta para Plomería | mrtpvrest',
    metaDescription:
      'Punto de venta para tienda de plomería: medidas y roscas por artículo, código de barras, precio de mayoreo y corte de caja. Windows, Android y web.',
    eyebrow: 'Giro · Plomería',
    h1: 'El punto de venta para tu tienda de plomería',
    intro:
      'En plomería la diferencia entre vender bien y vender mal es la medida y la rosca. Cada artículo guarda su medida, su rosca y su material, se cobra escaneando y el precio de mayoreo se aplica solo cuando el cliente lleva volumen.',
    highlights: [
      { title: 'Medida, rosca y material', text: 'Los atributos del artículo se llaman como en tu mostrador, no "talla" y "color".' },
      { title: 'Cobra escaneando', text: 'El código de barras resuelve el artículo exacto: sin confundir un 1/2" con un 3/4".' },
      { title: 'Precio de mayoreo', text: 'El plomero que lleva caja paga precio de caja, sin que nadie saque la calculadora.' },
      { title: 'Dónde está cada cosa', text: 'Pasillo y anaquel por artículo, buscable desde el catálogo.' },
    ],
    pains: [
      ['Confundir medidas', 'Un 1/2" y un 3/4" se parecen y se cobra el equivocado.', 'Escaneas y sale el artículo exacto, con su medida.'],
      ['Mayoreo improvisado', 'El descuento depende de quién atiende.', 'Escalón de precio por cantidad, igual para todos.'],
      ['Buscar en el almacén', 'Nadie recuerda en qué anaquel quedó.', 'Ubicación guardada por artículo.'],
    ],
    faqs: [
      ['¿Puedo guardar la medida y la rosca de cada pieza?', 'Sí. El catálogo usa los nombres de tu giro (medida, rosca, material) en vez de los de ropa.'],
      ['¿Maneja precio por caja y por pieza?', 'Sí. Registras cuántas piezas trae la caja y el mostrador captura "2 cajas": el sistema cobra y descuenta las 200 piezas. Además puedes definir escalones de precio por cantidad, que se aplican solos.'],
      ['¿Funciona sin internet?', 'Sí, se instala en Windows y Android y sincroniza cuando vuelve la conexión.'],
    ],
  },
  {
    slug: 'pinturas',
    nav: 'Pinturas',
    metaTitle: 'Punto de Venta para Tienda de Pinturas | mrtpvrest',
    metaDescription:
      'Punto de venta para tienda de pinturas: venta por litro, presentaciones y códigos de color, precio de mayoreo y corte de caja. Windows, Android y web.',
    eyebrow: 'Giro · Pinturas',
    h1: 'El punto de venta para tu tienda de pinturas',
    intro:
      'En pinturas el mismo color cambia de precio según la presentación, y buena parte se despacha por litro. Cobra por litro con decimales, guarda presentación y código de color como atributos, y aplica precio de mayoreo al contratista.',
    highlights: [
      { title: 'Venta por litro', text: 'Cobra 3.5 L como 3.5 L: la cantidad admite decimales y el stock se descuenta igual.' },
      { title: 'Presentación y color', text: 'Cada presentación es su propio artículo, con su precio y su código de barras.' },
      { title: 'Precio para contratista', text: 'Escalones por cantidad: el que lleva cubeta paga precio de cubeta.' },
      { title: 'Corte de caja por turno', text: 'Esperado contra contado al cierre, con entradas, salidas y gastos.' },
    ],
    pains: [
      ['Litro redondeado', 'El POS solo cuenta piezas y el granel se pierde.', 'Cantidad decimal por litro.'],
      ['Misma pintura, varios precios', 'La presentación se confunde y se cobra de menos.', 'Un artículo por presentación, con su código.'],
      ['Descuento a ojo', 'El precio de contratista lo decide quien atiende.', 'Escalón de precio aplicado por el sistema.'],
    ],
    faqs: [
      ['¿Puedo vender por litro?', 'Sí. Marcas el artículo con unidad "litros" y capturas la cantidad con decimales.'],
      ['¿Cada presentación es un artículo distinto?', 'Sí, cada presentación tiene su propio precio, stock y código de barras.'],
      ['¿Sirve sin internet?', 'Sí. Sigue cobrando y sincroniza al volver la conexión.'],
    ],
  },
  {
    slug: 'materiales-construccion',
    nav: 'Materiales de construcción',
    metaTitle: 'Punto de Venta para Materiales de Construcción | mrtpvrest',
    metaDescription:
      'Punto de venta para materiales de construcción: venta por kilo o metro, precio de mayoreo por volumen y corte de caja. Windows, Android y web.',
    eyebrow: 'Giro · Materiales de construcción',
    h1: 'El punto de venta para tu tienda de materiales',
    intro:
      'En materiales casi todo se vende por peso o por volumen, y el que compra en cantidad espera otro precio. Cobra por kilo o metro con decimales, define escalones de mayoreo y cuadra tu caja por turno, aunque se caiga el internet.',
    highlights: [
      { title: 'Por kilo, metro o pieza', text: 'Cada artículo con su unidad, y la cantidad con decimales cuando va a granel.' },
      { title: 'Mayoreo por volumen', text: 'De cierta cantidad en adelante, otro precio. El sistema aplica el escalón al cobrar.' },
      { title: 'Cobra escaneando', text: 'Código de barras por artículo, sin teclear claves.' },
      { title: 'Corte de caja que cuadra', text: 'Turno con esperado contra contado, entradas, salidas y gastos.' },
    ],
    pains: [
      ['Peso a ojo', 'El granel se redondea y se pierde margen.', 'Cantidad decimal por kilo o metro.'],
      ['Mayoreo sin regla', 'Cada quien da el precio que cree.', 'Escalones por cantidad, aplicados solos.'],
      ['Caja descuadrada', 'Mucho efectivo y cero claridad al cierre.', 'Corte por turno con diferencia a la vista.'],
    ],
    faqs: [
      ['¿Puedo vender por kilo?', 'Sí. El artículo lleva unidad "kilos" y la cantidad acepta decimales.'],
      ['¿Puedo tener precio de mayoreo por volumen?', 'Sí. Defines a partir de qué cantidad aplica cada precio y el sistema resuelve el escalón al cobrar.'],
      ['¿Funciona sin internet?', 'Sí. Windows y Android siguen cobrando sin conexión y sincronizan al volver.'],
    ],
  },
]

export function getFerreteriaVertical(slug: string) {
  return ferreteriaVerticals.find((v) => v.slug === slug)
}
