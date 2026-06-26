// Giros de retail para MODA+ (punto de venta de ropa). Sin imagen: el hero
// usa solo copy, igual que las comparativas. Marco propio MODA+ (modaUrl).
export type ModaVertical = {
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

export const modaVerticals: ModaVertical[] = [
  {
    slug: 'boutique',
    nav: 'Boutique',
    metaTitle: 'Punto de Venta para Boutique | MODA+',
    metaDescription:
      'Punto de venta para boutique: inventario por talla y color, etiquetas con código de barras y corte de caja, en Windows, Android y web. Pruébalo gratis.',
    eyebrow: 'Giro · Boutique',
    h1: 'El punto de venta para tu boutique',
    intro:
      'En una boutique cada prenda tiene su talla, su color y su rotación distinta. MODA+ maneja la matriz de talla y color por producto, imprime etiquetas con código de barras y cuadra tu caja por turno, en tu computadora o celular, aunque se caiga el internet.',
    highlights: [
      { title: 'Matriz de talla y color', text: 'Cada prenda con su matriz real de tallas y colores, un SKU por variante con su stock y precio, no una lista plana.' },
      { title: 'Etiquetas y código de barras', text: 'Imprime etiquetas con código de barras y cobra escaneando, sin teclear precios ni equivocarte de modelo.' },
      { title: 'Corte de caja que cuadra', text: 'Abre turno, registra entradas, salidas y gastos, y cierra con esperado vs. contado.' },
      { title: 'En Windows, Android y web', text: 'Instálalo en PC o celular, o úsalo en la web, y sigue vendiendo aunque se caiga la conexión.' },
    ],
    pains: [
      ['Inventario en libreta', 'No sabes qué tallas y colores te quedan hasta revisar a mano.', 'Matriz de talla y color en vivo, con aviso de stock bajo.'],
      ['POS genérico', 'Las apps gratuitas no manejan variantes ni etiquetas de ropa.', 'Hecho para boutique: variantes, etiquetas y código de barras de serie.'],
      ['Caja descuadrada', 'Mucho efectivo y cero claridad al cierre.', 'Corte por turno con esperado, contado y diferencia.'],
    ],
    faqs: [
      ['¿Maneja tallas y colores por prenda?', 'Sí. Cada producto tiene su matriz de tallas y colores (un SKU por variante) con su stock, precio y etiqueta propios.'],
      ['¿Funciona sin internet?', 'Sí. MODA+ se instala en Windows y Android y sigue cobrando aunque se caiga la conexión; sincroniza cuando vuelve.'],
    ],
  },
  {
    slug: 'zapateria',
    nav: 'Zapatería',
    metaTitle: 'Punto de Venta para Zapatería | MODA+',
    metaDescription:
      'Punto de venta para zapatería: inventario por número y modelo, etiquetas con código de barras y corte de caja, en Windows, Android y web. Prueba gratis.',
    eyebrow: 'Giro · Zapatería',
    h1: 'El punto de venta para tu zapatería',
    intro:
      'El calzado se vende por número y por modelo, y el inventario por talla es justo donde se pierde el control. MODA+ maneja cada modelo con su matriz de números y colores, imprime etiquetas con código de barras y te dice qué números te quedan, sin revisar caja por caja.',
    highlights: [
      { title: 'Inventario por número y modelo', text: 'Cada modelo con su matriz de números y colores, un SKU por par, con stock y precio propios.' },
      { title: 'Etiquetas y código de barras', text: 'Imprime etiquetas con código de barras y cobra escaneando el par correcto sin equivocarte de número.' },
      { title: 'Stock por talla en vivo', text: 'Sabes al instante qué números te quedan de cada modelo y cuáles están por agotarse.' },
      { title: 'En cualquier equipo, sin internet', text: 'Windows, Android o web con una sola cuenta; sigue vendiendo aunque falle la conexión.' },
    ],
    pains: [
      ['Números que no cuadran', 'No sabes qué tallas te quedan de cada modelo.', 'Matriz de números por modelo, con stock en vivo.'],
      ['Cobro lento', 'Buscar el modelo y el número a mano tarda y se equivoca.', 'Cobra escaneando el código de barras del par.'],
      ['Caja informal', 'Ventas anotadas sin control al cierre.', 'Corte por turno con esperado, contado y diferencia.'],
    ],
    faqs: [
      ['¿Maneja inventario por número de calzado?', 'Sí. Cada modelo es una matriz de números (y colores si aplica), con un SKU por variante, su stock, precio y etiqueta.'],
      ['¿Imprime etiquetas con código de barras?', 'Sí: etiquetas con código de barras (CODE128) e impresión de tickets en impresora térmica por red.'],
    ],
  },
  {
    slug: 'lenceria',
    nav: 'Lencería',
    metaTitle: 'Punto de Venta para Lencería | MODA+',
    metaDescription:
      'Punto de venta para lencería: inventario por talla y color, etiquetas con código de barras y corte de caja, en Windows, Android y web. Prueba gratis.',
    eyebrow: 'Giro · Lencería',
    h1: 'El punto de venta para tu tienda de lencería',
    intro:
      'La lencería maneja muchas tallas, colores y modelos en poco espacio. MODA+ controla cada referencia por su matriz de talla y color, imprime etiquetas con código de barras para cobrar escaneando y cuadra la caja por turno, en tu compu o celular.',
    highlights: [
      { title: 'Matriz de talla y color', text: 'Cada modelo con su matriz de tallas y colores, un SKU por variante, con su stock y precio propios.' },
      { title: 'Etiquetas y código de barras', text: 'Imprime etiquetas con código de barras y cobra escaneando, sin teclear precios ni confundir referencias.' },
      { title: 'Control de mucho surtido', text: 'Aviso de stock bajo por variante para que no te quedes sin las tallas y colores que más rotan.' },
      { title: 'En Windows, Android y web', text: 'Una sola cuenta en todos tus equipos, con corte de caja por turno que cuadra.' },
    ],
    pains: [
      ['Mucha referencia, poco control', 'Tallas y colores que no sabes si te quedan.', 'Matriz de talla y color por modelo, con stock en vivo.'],
      ['Cobro confuso', 'Modelos parecidos que se cobran mal.', 'Cobra escaneando el código de barras de la variante exacta.'],
      ['Caja a ojo', 'Cierre sin claridad de cuánto debería haber.', 'Corte por turno con esperado, contado y diferencia.'],
    ],
    faqs: [
      ['¿Sirve para mucho surtido de tallas y colores?', 'Sí. Cada modelo es una matriz de talla y color (un SKU por variante) con su stock, precio y etiqueta, con aviso de stock bajo.'],
      ['¿En qué equipos corre?', 'En PC con Windows, en tablet o celular Android y en la web; la misma cuenta funciona en todos.'],
    ],
  },
  {
    slug: 'ropa-infantil',
    nav: 'Tienda de ropa infantil',
    metaTitle: 'Punto de Venta para Tienda de Ropa Infantil | MODA+',
    metaDescription:
      'Punto de venta para ropa infantil: inventario por talla (edad) y color, etiquetas con código de barras y corte de caja, en Windows, Android y web. Prueba gratis.',
    eyebrow: 'Giro · Ropa infantil',
    h1: 'El punto de venta para tu tienda de ropa infantil',
    intro:
      'La ropa infantil se vende por edad y talla, con mucha variedad de modelos y colores. MODA+ maneja cada prenda por su matriz de talla y color, imprime etiquetas con código de barras y cuadra la caja por turno, en tu computadora o celular.',
    highlights: [
      { title: 'Tallas por edad y modelo', text: 'Cada prenda con su matriz de tallas (por edad) y colores, un SKU por variante con su stock y precio.' },
      { title: 'Etiquetas y código de barras', text: 'Imprime etiquetas con código de barras y cobra escaneando la talla y el modelo correctos.' },
      { title: 'Aviso de stock bajo', text: 'Sabes qué tallas y modelos te quedan y cuáles reponer antes de que se agoten.' },
      { title: 'En Windows, Android y web', text: 'Una sola cuenta en todos tus equipos, con corte de caja por turno que cuadra.' },
    ],
    pains: [
      ['Muchas tallas y modelos', 'Difícil saber qué te queda de cada edad.', 'Matriz de talla y color por modelo, con stock en vivo.'],
      ['Cobro lento', 'Buscar talla y modelo a mano tarda y se equivoca.', 'Cobra escaneando el código de barras de la prenda.'],
      ['Caja a ojo', 'Cierre sin claridad de cuánto debería haber.', 'Corte por turno con esperado, contado y diferencia.'],
    ],
    faqs: [
      ['¿Maneja tallas por edad?', 'Sí. Cada modelo es una matriz de tallas (por edad) y colores, con un SKU por variante, su stock, precio y etiqueta.'],
      ['¿Funciona sin internet?', 'Sí. Se instala en Windows y Android y sigue cobrando aunque se caiga la conexión; sincroniza al volver.'],
    ],
  },
  {
    slug: 'ropa-deportiva',
    nav: 'Tienda de ropa deportiva',
    metaTitle: 'Punto de Venta para Tienda de Ropa Deportiva | MODA+',
    metaDescription:
      'Punto de venta para ropa deportiva: inventario por talla y color, etiquetas con código de barras y corte de caja, en Windows, Android y web. Pruébalo gratis.',
    eyebrow: 'Giro · Ropa deportiva',
    h1: 'El punto de venta para tu tienda de ropa deportiva',
    intro:
      'La ropa deportiva combina tallas, colores y modelos por disciplina, con marcas y rotación rápida. MODA+ maneja cada prenda por su matriz de talla y color, imprime etiquetas con código de barras y cuadra la caja por turno.',
    highlights: [
      { title: 'Matriz de talla y color', text: 'Cada modelo con su matriz de tallas y colores, un SKU por variante, con su stock y precio propios.' },
      { title: 'Etiquetas y código de barras', text: 'Imprime etiquetas con código de barras y cobra escaneando, sin teclear precios ni equivocarte de modelo.' },
      { title: 'Control de rotación', text: 'Aviso de stock bajo por variante para reponer a tiempo lo que más se mueve.' },
      { title: 'En Windows, Android y web', text: 'Una sola cuenta en todos tus equipos, con corte de caja por turno.' },
    ],
    pains: [
      ['Surtido grande', 'Tallas y colores que no sabes si te quedan.', 'Matriz de talla y color por modelo, con stock en vivo.'],
      ['Cobro lento en hora pico', 'Buscar modelos parecidos a mano.', 'Cobra escaneando el código de barras de la variante.'],
      ['Caja descuadrada', 'Cierre sin control de lo vendido.', 'Corte por turno con esperado, contado y diferencia.'],
    ],
    faqs: [
      ['¿Sirve para mucho surtido de tallas y colores?', 'Sí. Cada modelo es una matriz de talla y color (un SKU por variante) con su stock, precio y etiqueta, con aviso de stock bajo.'],
      ['¿En qué equipos corre?', 'En PC con Windows, en tablet o celular Android y en la web; la misma cuenta funciona en todos.'],
    ],
  },
  {
    slug: 'uniformes',
    nav: 'Tienda de uniformes',
    metaTitle: 'Punto de Venta para Tienda de Uniformes | MODA+',
    metaDescription:
      'Punto de venta para tienda de uniformes: inventario por talla y modelo, etiquetas con código de barras y corte de caja, en Windows, Android y web. Prueba gratis.',
    eyebrow: 'Giro · Uniformes',
    h1: 'El punto de venta para tu tienda de uniformes',
    intro:
      'Los uniformes escolares e industriales se venden por talla y modelo, con picos fuertes de temporada. MODA+ maneja cada prenda por su matriz de talla y color, imprime etiquetas con código de barras y cuadra la caja por turno, aunque se caiga el internet en plena temporada.',
    highlights: [
      { title: 'Tallas y modelos por institución', text: 'Cada uniforme con su matriz de tallas y colores, un SKU por variante, con su stock y precio.' },
      { title: 'Etiquetas y código de barras', text: 'Imprime etiquetas con código de barras y cobra escaneando la talla y el modelo correctos.' },
      { title: 'Aguanta la temporada', text: 'Cobro rápido y stock por talla en vivo para los picos de regreso a clases.' },
      { title: 'En Windows, Android y web', text: 'Una sola cuenta en todos tus equipos, con corte de caja por turno.' },
    ],
    pains: [
      ['Temporada caótica', 'Filas largas en regreso a clases.', 'Cobro veloz escaneando, con stock por talla en vivo.'],
      ['Tallas que no cuadran', 'No sabes qué tallas te quedan de cada modelo.', 'Matriz de talla y color por uniforme, con aviso de stock bajo.'],
      ['Caja descuadrada', 'Mucho movimiento y cierre a ojo.', 'Corte por turno con esperado, contado y diferencia.'],
    ],
    faqs: [
      ['¿Maneja tallas por modelo de uniforme?', 'Sí. Cada uniforme es una matriz de tallas y colores, con un SKU por variante, su stock, precio y etiqueta.'],
      ['¿Aguanta los picos de temporada?', 'Sí: cobro rápido escaneando código de barras y, si se cae el internet, sigue vendiendo y sincroniza después.'],
    ],
  },
  {
    slug: 'merceria',
    nav: 'Mercería',
    metaTitle: 'Sistema de Punto de Venta para Mercería | MODA+',
    metaDescription:
      'Punto de venta para mercería: inventario por color y medida, etiquetas con código de barras y corte de caja, en Windows, Android y web. Pruébalo gratis.',
    eyebrow: 'Giro · Mercería',
    h1: 'El punto de venta para tu mercería',
    intro:
      'Una mercería maneja muchísimas referencias chicas: hilos, botones, cierres y telas por color y medida. MODA+ controla cada producto por sus variantes, imprime etiquetas con código de barras y cuadra la caja por turno, sin perderte entre tanto surtido.',
    highlights: [
      { title: 'Variantes por color y medida', text: 'Cada producto con sus variantes (color, medida, calibre), un SKU por cada una, con su stock y precio.' },
      { title: 'Etiquetas y código de barras', text: 'Etiqueta y cobra escaneando incluso los artículos más chicos, sin teclear precios.' },
      { title: 'Control de mucho surtido', text: 'Aviso de stock bajo por variante para reponer a tiempo lo que más se mueve.' },
      { title: 'En Windows, Android y web', text: 'Una sola cuenta en todos tus equipos, con corte de caja por turno.' },
    ],
    pains: [
      ['Cientos de referencias', 'Imposible saber a mano qué te queda.', 'Inventario por variante con aviso de stock bajo.'],
      ['Cobro lento', 'Buscar el precio de artículos chicos tarda.', 'Cobra escaneando el código de barras de cada producto.'],
      ['Caja a ojo', 'Cierre sin claridad con tanto ticket chico.', 'Corte por turno con esperado, contado y diferencia.'],
    ],
    faqs: [
      ['¿Sirve para mucho surtido de productos chicos?', 'Sí. Cada producto puede tener variantes (color, medida) con un SKU propio, su stock, precio y etiqueta.'],
      ['¿Puedo cobrar escaneando?', 'Sí: imprime etiquetas con código de barras (CODE128) y cobra escaneando, sin teclear precios.'],
    ],
  },
]

export function getModaVertical(slug: string) {
  return modaVerticals.find((v) => v.slug === slug)
}
