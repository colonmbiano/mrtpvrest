export type Comparison = {
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
  { title: 'Ecosistema conectado', text: 'TPV, KDS de cocina, delivery, kiosko, app de cliente y administración comparten la misma operación en tiempo real, no módulos sueltos.' },
  { title: 'Pensado para LATAM', text: 'Interfaz cálida en español, flujos para piso y cocina, y soporte en español durante el arranque.' },
  { title: 'Precio público y transparente', text: 'Planes visibles desde el sitio, con 6 meses gratis y sin tarjeta para evaluar antes de decidir.' },
  { title: 'Delivery propio con caja conciliada', text: 'Reparto propio con app de repartidor y corte de caja del repartidor ligado a sus pedidos.' },
]

const sharedCriteria = [
  { title: 'Cobertura de tu operación', text: 'Confirma que la herramienta cubra caja, cocina, reparto, autoservicio y reportes sin sumar sistemas externos.' },
  { title: 'Tiempo de arranque', text: 'Pregunta cuánto tardas en cobrar tu primera orden y qué tan asistido es el onboarding.' },
  { title: 'Costo total y permanencia', text: 'Revisa precio público, qué incluye cada plan y si hay permanencia o cobros por pedido.' },
  { title: 'Hardware y conectividad', text: 'Valida en qué equipos corre y cómo se comporta la impresión y la operación en hora pico.' },
]

export const comparisons: Comparison[] = [
  {
    slug: 'parrot',
    competitor: 'Parrot Software',
    metaTitle: 'Alternativa a Parrot Software para Restaurantes | MRTPVREST',
    metaDescription:
      '¿Buscas una alternativa a Parrot Software? Compara MRTPVREST: punto de venta, KDS, delivery, kiosko y administración conectados. Prueba 6 meses gratis.',
    eyebrow: 'Comparativa · Alternativa',
    h1: 'MRTPVREST como alternativa a Parrot Software',
    intro:
      'Si estás evaluando Parrot Software para tu restaurante, vale la pena comparar opciones antes de decidir. Aquí te mostramos en qué se enfoca MRTPVREST y qué criterios conviene revisar para elegir bien.',
    about:
      'Parrot Software es una plataforma mexicana de gestión y punto de venta para restaurantes, con funciones de pedidos, facturación, inventario y operación de cocina. Para detalles y precios actualizados, consulta su sitio oficial.',
    whenItFits:
      'MRTPVREST encaja cuando quieres un ecosistema donde caja, cocina, delivery, kiosko, app de cliente y administración trabajan como una sola operación en tiempo real, con precio público y prueba sin tarjeta.',
    reasons: sharedReasons,
    criteria: sharedCriteria,
    faqs: [
      ['¿MRTPVREST es una alternativa a Parrot Software?', 'Sí. MRTPVREST es un punto de venta para restaurantes con TPV, KDS, delivery, kiosko, app de cliente y administración conectados; puedes probarlo 6 meses gratis y sin tarjeta para compararlo con tu opción actual.'],
      ['¿Puedo migrar por etapas?', 'Sí. Puedes empezar por reportes, cocina o TPV sin apagar de golpe tu operación actual.'],
    ],
  },
  {
    slug: 'soft-restaurant',
    competitor: 'Soft Restaurant',
    metaTitle: 'Alternativa a Soft Restaurant para Restaurantes | MRTPVREST',
    metaDescription:
      '¿Buscas una alternativa a Soft Restaurant? Conoce MRTPVREST: punto de venta en la nube con KDS, delivery, kiosko y reportes en tiempo real. Prueba gratis.',
    eyebrow: 'Comparativa · Alternativa',
    h1: 'MRTPVREST como alternativa a Soft Restaurant',
    intro:
      'Soft Restaurant es una opción conocida en México. Si estás comparando sistemas de punto de venta para tu restaurante, aquí tienes en qué se enfoca MRTPVREST y qué revisar antes de elegir.',
    about:
      'Soft Restaurant, de NationalSoft, es uno de los sistemas de punto de venta para restaurantes más establecidos en México, con módulos de operación, inventario y facturación. Para funciones y precios actuales, consulta su sitio oficial.',
    whenItFits:
      'MRTPVREST encaja cuando buscas una plataforma en la nube con apps conectadas en tiempo real (TPV, KDS, delivery, kiosko, cliente y admin), lectura del negocio al minuto y un arranque rápido con precio público.',
    reasons: sharedReasons,
    criteria: sharedCriteria,
    faqs: [
      ['¿MRTPVREST funciona en la nube?', 'Sí, la administración y los reportes viven en la nube y las apps operativas sincronizan en tiempo real; la impresión de tickets es local por red.'],
      ['¿Qué incluye la prueba gratis?', 'Puedes evaluar la plataforma 6 meses sin tarjeta y sin bloqueo de datos durante la prueba.'],
    ],
  },
  {
    slug: 'loyverse',
    competitor: 'Loyverse',
    metaTitle: 'Alternativa a Loyverse para Restaurantes | MRTPVREST',
    metaDescription:
      '¿Loyverse se te queda corto para tu restaurante? MRTPVREST suma KDS, delivery, kiosko y operación de restaurante en tiempo real. Prueba 6 meses gratis.',
    eyebrow: 'Comparativa · Alternativa',
    h1: 'MRTPVREST como alternativa a Loyverse',
    intro:
      'Loyverse es un punto de venta gratuito muy usado por pequeños negocios. Si tu restaurante necesita cocina, reparto y autoservicio conectados, aquí tienes en qué se enfoca MRTPVREST.',
    about:
      'Loyverse es un sistema de punto de venta gratuito orientado a comercios pequeños, con app móvil y funciones de venta y fidelización. No está especializado en la operación completa de un restaurante. Para detalles actuales, consulta su sitio oficial.',
    whenItFits:
      'MRTPVREST encaja cuando tu restaurante ya necesita más que cobrar: cocina con KDS, delivery propio con caja conciliada, kiosko de autoservicio y pedidos por QR, todo en una sola operación.',
    reasons: sharedReasons,
    criteria: sharedCriteria,
    faqs: [
      ['¿En qué se diferencia de un POS general?', 'MRTPVREST está hecho para restaurantes: conecta cocina (KDS), delivery, kiosko, pedidos QR y administración en una sola operación, no solo el cobro.'],
      ['¿Tiene plan para empezar?', 'Sí, hay un plan único con acceso total a todos los módulos y hasta 6 meses gratis por lanzamiento, sin tarjeta.'],
    ],
  },
]

export function getComparison(slug: string) {
  return comparisons.find((c) => c.slug === slug)
}
