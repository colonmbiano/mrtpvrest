// Comparativas "alternativa a X" para MODA+ (punto de venta de ropa).
// Marco propio (MODA+, modaUrl), separado de las comparativas restauranteras.
export type ModaComparison = {
  slug: string
  competitor: string
  metaTitle: string
  metaDescription: string
  eyebrow: string
  h1: string
  intro: string
  about: string
  whenItFits: string
  reasons: { title: string; text: string }[]
  criteria: { title: string; text: string }[]
  faqs: [string, string][]
}

const sharedReasons = [
  { title: 'Hecho para ropa, no adaptado', text: 'Cada prenda es una matriz de talla y color (un SKU por variante) con su stock, precio y etiqueta, no una lista plana que armas a mano.' },
  { title: 'Etiquetas y código de barras', text: 'Imprime etiquetas con código de barras (CODE128) en impresora térmica y cobra escaneando, sin teclear precios ni equivocarte de modelo.' },
  { title: 'Sigue vendiendo sin internet', text: 'Instálalo en Windows o Android y cobra aunque se caiga la conexión; sincroniza solo cuando vuelve la red.' },
  { title: 'Una cuenta en todos tus equipos', text: 'La misma tienda en PC con Windows, en tablet o celular Android y en la web, con corte de caja por turno que cuadra.' },
]

const sharedCriteria = [
  { title: 'Variantes reales de talla y color', text: 'Confirma si maneja una matriz de talla y color por producto o si tienes que dar de alta cada combinación a mano.' },
  { title: 'Etiquetas y lector de código de barras', text: 'Revisa si imprime etiquetas con código de barras y si puedes cobrar escaneando, no solo buscando por nombre.' },
  { title: 'Operación sin internet', text: 'Pregunta qué pasa si se cae la conexión: ¿sigue cobrando y sincroniza después, o se detiene la venta?' },
  { title: 'Equipos, costo y permanencia', text: 'Valida en qué equipos corre (Windows, Android, web), el precio público y si hay permanencia o cobros ocultos.' },
]

export const modaComparisons: ModaComparison[] = [
  {
    slug: 'sicar',
    competitor: 'SICAR',
    metaTitle: 'Alternativa a SICAR para Tienda de Ropa | MODA+',
    metaDescription:
      '¿Buscas una alternativa a SICAR para tu boutique? MODA+ tiene matriz de talla y color, etiquetas con código de barras y app en Windows, Android y web.',
    eyebrow: 'Comparativa · Alternativa',
    h1: 'MODA+ como alternativa a SICAR para tu tienda de ropa',
    intro:
      'Si estás evaluando SICAR para tu tienda de ropa, conviene comparar antes de decidir. Aquí te mostramos en qué se enfoca MODA+ y qué criterios revisar para elegir bien el punto de venta de tu boutique.',
    about:
      'SICAR es uno de los sistemas de punto de venta más conocidos en México, con versión de pago único, instalación en Windows y módulos para boutique con tallas y colores. Para funciones y precios actuales, consulta su sitio oficial.',
    whenItFits:
      'MODA+ encaja cuando quieres la misma matriz de talla y color pero en una app moderna multiplataforma (Windows, Android y web con una sola cuenta), que sigue vendiendo sin internet, se actualiza sola y la puedes probar en la nube sin instalar nada para evaluarla.',
    reasons: sharedReasons,
    criteria: sharedCriteria,
    faqs: [
      ['¿MODA+ es una alternativa a SICAR?', 'Sí. MODA+ es un punto de venta hecho para tiendas de ropa con matriz de talla y color, etiquetas con código de barras y corte de caja; puedes probarlo 6 meses gratis y sin tarjeta para compararlo con tu opción actual.'],
      ['¿Necesito instalar algo para probarlo?', 'No. Puedes empezar en la web en minutos y, si quieres, instalar la app en Windows o Android después; la misma cuenta funciona en todos los equipos.'],
    ],
  },
  {
    slug: 'loyverse',
    competitor: 'Loyverse',
    metaTitle: 'Alternativa a Loyverse para Tienda de Ropa | MODA+',
    metaDescription:
      '¿Loyverse se te queda corto para tu tienda de ropa? MODA+ maneja talla y color, etiquetas con código de barras y corte de caja, en Windows, Android y web.',
    eyebrow: 'Comparativa · Alternativa',
    h1: 'MODA+ como alternativa a Loyverse para tu tienda de ropa',
    intro:
      'Loyverse es un punto de venta gratuito y móvil muy popular entre comercios pequeños. Si tu negocio es una tienda de ropa, aquí tienes en qué se enfoca MODA+ y por qué las variantes por talla y color hacen la diferencia.',
    about:
      'Loyverse es un sistema de punto de venta gratuito, orientado a comercios pequeños, con app móvil y funciones generales de venta y fidelización. No está especializado en tiendas de ropa (variantes por talla y color, etiquetas por prenda). Para detalles actuales, consulta su sitio oficial.',
    whenItFits:
      'MODA+ encaja cuando tu tienda de ropa ya necesita más que cobrar: manejar cada prenda por su matriz de talla y color (un SKU por variante), imprimir etiquetas con código de barras y cuadrar la caja por turno, sin dar de alta combinaciones a mano.',
    reasons: sharedReasons,
    criteria: sharedCriteria,
    faqs: [
      ['¿En qué se diferencia de un POS general como Loyverse?', 'MODA+ está hecho para ropa: cada producto es una matriz de talla y color con un SKU por variante, con su stock, precio y etiqueta propios, no una lista plana de productos.'],
      ['¿También funciona en celular?', 'Sí. MODA+ corre en Android, en PC con Windows y en la web, y la misma cuenta funciona en todos los equipos.'],
    ],
  },
  {
    slug: 'intac',
    competitor: 'INTAC',
    metaTitle: 'Alternativa a INTAC para Tienda de Ropa | MODA+',
    metaDescription:
      '¿Buscas una alternativa a INTAC para tu tienda de ropa? MODA+ maneja talla y color, etiquetas con código de barras y corte de caja, en Windows, Android y web.',
    eyebrow: 'Comparativa · Alternativa',
    h1: 'MODA+ como alternativa a INTAC para tu tienda de ropa',
    intro:
      'INTAC es un sistema de punto de venta e inventarios usado por comercios en México, con manejo de tallas y colores. Si estás comparando opciones para tu tienda de ropa, aquí tienes en qué se enfoca MODA+ y qué revisar antes de decidir.',
    about:
      'INTAC es un software de punto de venta e inventarios para comercios en México, con control de tallas, medidas y colores. Para funciones y precios actuales, consulta su sitio oficial.',
    whenItFits:
      'MODA+ encaja cuando quieres manejar tu inventario por talla y color en una app moderna multiplataforma (Windows, Android y web con una sola cuenta), que sigue vendiendo sin internet, se actualiza sola y la pruebas en la nube sin instalar nada para evaluarla.',
    reasons: sharedReasons,
    criteria: sharedCriteria,
    faqs: [
      ['¿MODA+ es una alternativa a INTAC?', 'Sí. MODA+ es un punto de venta hecho para tiendas de ropa con matriz de talla y color, etiquetas con código de barras y corte de caja; puedes probarlo 6 meses gratis y sin tarjeta para compararlo con tu opción actual.'],
      ['¿Puedo usarlo en celular además de la PC?', 'Sí. MODA+ corre en PC con Windows, en Android y en la web, con la misma cuenta en todos los equipos.'],
    ],
  },
  {
    slug: 'kyte',
    competitor: 'Kyte',
    metaTitle: 'Alternativa a Kyte para Tienda de Ropa | MODA+',
    metaDescription:
      '¿Buscas una alternativa a Kyte para tu tienda de ropa? MODA+ maneja matriz de talla y color, etiquetas con código de barras y corte de caja, en Windows, Android y web.',
    eyebrow: 'Comparativa · Alternativa',
    h1: 'MODA+ como alternativa a Kyte para tu tienda de ropa',
    intro:
      'Kyte es una app de punto de venta y catálogo muy usada por comercios y vendedores. Si tu negocio es una tienda de ropa, aquí tienes en qué se enfoca MODA+ y por qué las variantes por talla y color hacen la diferencia.',
    about:
      'Kyte es un sistema de punto de venta, catálogo e inventario orientado a pequeños comercios y venta por catálogo, con app móvil. Es de propósito general, no especializado en variantes de ropa por talla y color. Para detalles actuales, consulta su sitio oficial.',
    whenItFits:
      'MODA+ encaja cuando tu tienda de ropa necesita manejar cada prenda por su matriz de talla y color (un SKU por variante), imprimir etiquetas con código de barras y cuadrar la caja por turno, además de operar en PC con Windows y sin internet.',
    reasons: sharedReasons,
    criteria: sharedCriteria,
    faqs: [
      ['¿MODA+ es una alternativa a Kyte?', 'Sí. MODA+ es un punto de venta hecho para tiendas de ropa con matriz de talla y color, etiquetas con código de barras y corte de caja; puedes probarlo 6 meses gratis y sin tarjeta para compararlo.'],
      ['¿Funciona en PC además de celular?', 'Sí. MODA+ corre en PC con Windows, en Android y en la web, con la misma cuenta en todos los equipos.'],
    ],
  },
  {
    slug: 'vendty',
    competitor: 'Vendty',
    metaTitle: 'Alternativa a Vendty para Tienda de Ropa | MODA+',
    metaDescription:
      '¿Buscas una alternativa a Vendty para tu tienda de ropa? MODA+ maneja talla y color, etiquetas con código de barras y corte de caja, en Windows, Android y web.',
    eyebrow: 'Comparativa · Alternativa',
    h1: 'MODA+ como alternativa a Vendty para tu tienda de ropa',
    intro:
      'Vendty es un software de punto de venta usado por comercios en la región, incluido el sector de moda. Si estás comparando opciones para tu tienda de ropa, aquí tienes en qué se enfoca MODA+ y qué revisar antes de decidir.',
    about:
      'Vendty es un sistema de punto de venta e inventario para comercios, con opciones para tiendas de moda y calzado. Para funciones y precios actuales, consulta su sitio oficial.',
    whenItFits:
      'MODA+ encaja cuando quieres manejar tu inventario por talla y color en una app multiplataforma (Windows, Android y web con una sola cuenta), que sigue vendiendo sin internet, se actualiza sola y la pruebas sin instalar nada para evaluarla.',
    reasons: sharedReasons,
    criteria: sharedCriteria,
    faqs: [
      ['¿MODA+ es una alternativa a Vendty?', 'Sí. MODA+ es un punto de venta para tiendas de ropa con matriz de talla y color, etiquetas con código de barras y corte de caja; puedes probarlo 6 meses gratis y sin tarjeta.'],
      ['¿Sigue vendiendo sin internet?', 'Sí. Instálalo en Windows o Android y sigue cobrando aunque se caiga la conexión; sincroniza cuando vuelve.'],
    ],
  },
]

export function getModaComparison(slug: string) {
  return modaComparisons.find((c) => c.slug === slug)
}
