export type Vertical = {
  slug: string
  nav: string
  metaTitle: string
  metaDescription: string
  eyebrow: string
  h1: string
  intro: string
  image: string
  highlights: { title: string; text: string }[]
  pains: [string, string, string][]
  faqs: [string, string][]
}

export const verticals: Vertical[] = [
  {
    slug: 'taqueria',
    nav: 'Taquería',
    metaTitle: 'Punto de Venta para Taquería | MRTPVREST',
    metaDescription:
      'Punto de venta para taquería: cobra tacos por pieza, salsas y extras como modificadores, maneja delivery y cierra caja al turno. Prueba 14 días gratis.',
    eyebrow: 'Giro · Taquería',
    h1: 'El punto de venta para taquería que aguanta la hora pico',
    intro:
      'En una taquería el ticket es chico pero el volumen es enorme. MRTPVREST cobra tacos por pieza, suma salsas y extras como modificadores, manda la comanda al trompo y concilia la caja al cierre, sin frenar la fila.',
    image: '/showcase-warm/tpv.png',
    highlights: [
      { title: 'Cobro por pieza, rápido', text: 'Tacos, órdenes y extras en un toque, con modificadores de salsa, carne y guarnición sin teclear de más.' },
      { title: 'Comanda al instante', text: 'Lo que se cobra llega al trompo y a la plancha por KDS, sin papelitos que se pierden.' },
      { title: 'Delivery y para llevar', text: 'Pedidos a domicilio y para llevar conectados a la misma caja y cocina.' },
      { title: 'Caja que cuadra', text: 'Corte por turno con efectivo, transferencias y propinas, ideal para negocios de mucho cash.' },
    ],
    pains: [
      ['Fila que no avanza', 'Cobro lento en la hora de la comida.', 'Flujo táctil por pieza pensado para volumen alto.'],
      ['Salsas y extras sin control', 'Se regalan extras y no se cobran.', 'Modificadores con precio que sí entran al ticket.'],
      ['Caja revuelta', 'Mucho efectivo y cero claridad al cierre.', 'Corte por turno conciliado y auditable.'],
    ],
    faqs: [
      ['¿Sirve para cobrar tacos por pieza y por orden?', 'Sí. Puedes vender por pieza, por orden o por kilo y sumar salsas y extras como modificadores con su propio precio.'],
      ['¿Funciona para taquerías con mucho efectivo?', 'Sí, el corte de caja por turno concilia efectivo, transferencias y propinas para que el cierre cuadre.'],
    ],
  },
  {
    slug: 'pizzeria',
    nav: 'Pizzería',
    metaTitle: 'Punto de Venta para Pizzería | MRTPVREST',
    metaDescription:
      'Punto de venta para pizzería: tamaños y mitades, ingredientes extra, control de horno por KDS y delivery propio sin comisión. Prueba 14 días gratis.',
    eyebrow: 'Giro · Pizzería',
    h1: 'Punto de venta para pizzería: tamaños, mitades y delivery sin comisión',
    intro:
      'La pizza se vende por tamaño, por mitades y con extras, y casi siempre con reparto. MRTPVREST maneja variantes y mitades, manda el tiempo de horno al KDS y conecta tu delivery propio sin comisión por pedido.',
    image: '/showcase-warm/delivery.png',
    highlights: [
      { title: 'Tamaños y mitades', text: 'Vende por tamaño y arma pizzas mitad y mitad con ingredientes extra cobrados correctamente.' },
      { title: 'Tiempos de horno', text: 'El KDS muestra cada pedido y su tiempo para que ninguna pizza se quede en el horno.' },
      { title: 'Delivery propio', text: 'Reparto con app de repartidor y caja conciliada, sin pagar comisión por orden.' },
      { title: 'Pedidos QR y en línea', text: 'Recibe pedidos desde tu tienda en línea directo a cocina.' },
    ],
    pains: [
      ['Mitades mal cobradas', 'Combinaciones que se cobran a ojo.', 'Variantes y mitades con precio exacto.'],
      ['Repartos sin control', 'No sabes qué pizza va con quién.', 'Delivery propio rastreado y conciliado.'],
      ['Comisiones de plataformas', 'Cada pedido deja menos margen.', 'Tu tienda en línea sin comisión por orden.'],
    ],
    faqs: [
      ['¿Puedo vender pizzas mitad y mitad?', 'Sí, manejas tamaños, mitades e ingredientes extra con su precio, y todo llega claro a cocina.'],
      ['¿Incluye delivery propio?', 'Sí, con app de repartidor, rutas en mapa y corte de caja del repartidor ligado a sus entregas.'],
    ],
  },
  {
    slug: 'cafeteria',
    nav: 'Cafetería',
    metaTitle: 'Punto de Venta para Cafetería | MRTPVREST',
    metaDescription:
      'Punto de venta para cafetería: cobro rápido en mostrador, modificadores de leche y tamaño, puntos de cliente y pedidos QR. Prueba 14 días gratis.',
    eyebrow: 'Giro · Cafetería',
    h1: 'Punto de venta para cafetería: mostrador rápido y clientes que vuelven',
    intro:
      'La cafetería vive de la hora pico de la mañana y de los clientes frecuentes. MRTPVREST cobra rápido en mostrador, maneja modificadores de leche y tamaño, y suma puntos para que el cliente regrese.',
    image: '/showcase-warm/app-cliente.png',
    highlights: [
      { title: 'Mostrador veloz', text: 'Bebidas y panadería en un toque, con cola de pedidos para la barra.' },
      { title: 'Modificadores de bebida', text: 'Tamaño, tipo de leche, shots y jarabes cobrados sin enredos.' },
      { title: 'Puntos y clientes', text: 'Registra clientes frecuentes y premia su recurrencia con puntos.' },
      { title: 'Pedido por QR', text: 'El cliente pide desde la mesa por QR y la barra lo recibe al instante.' },
    ],
    pains: [
      ['Hora pico caótica', 'Fila larga al abrir.', 'Cobro y cola de barra ágiles para la mañana.'],
      ['Bebidas personalizadas', 'Cada quien pide distinto y se equivoca la barra.', 'Modificadores claros que llegan exactos a la barra.'],
      ['Clientes de una sola vez', 'Nadie regresa porque no hay incentivo.', 'Puntos y cuentas de cliente para fidelizar.'],
    ],
    faqs: [
      ['¿Maneja modificadores de bebidas?', 'Sí: tamaño, tipo de leche, shots extra y jarabes, cada uno con su precio y visibles en la barra.'],
      ['¿Tiene programa de puntos?', 'Sí, puedes registrar clientes y acumular puntos para fomentar la recurrencia.'],
    ],
  },
  {
    slug: 'bar',
    nav: 'Bar y cantina',
    metaTitle: 'Punto de Venta para Bar y Cantina | MRTPVREST',
    metaDescription:
      'Punto de venta para bar: cuentas abiertas largas, rondas, cuentas divididas, propinas y control de inventario de barra. Prueba 14 días gratis.',
    eyebrow: 'Giro · Bar y cantina',
    h1: 'Punto de venta para bar: cuentas abiertas, rondas y propinas bajo control',
    intro:
      'En un bar las cuentas se quedan abiertas horas, se piden rondas y al final hay que dividir. MRTPVREST mantiene cuentas largas, agrega rondas rápido, divide al cerrar y te ayuda a cuidar el inventario de barra.',
    image: '/showcase-warm/tpv.png',
    highlights: [
      { title: 'Cuentas abiertas', text: 'Abre cuentas por mesa o por cliente y mantenlas activas toda la noche.' },
      { title: 'Rondas en un toque', text: 'Repite la ronda anterior sin recapturar para no frenar el servicio.' },
      { title: 'Divide al cerrar', text: 'Separa la cuenta por persona o por producto y registra propinas.' },
      { title: 'Control de barra', text: 'Inventario y permisos por empleado para reducir mermas y faltantes.' },
    ],
    pains: [
      ['Cuentas que se enredan', 'Comandas sueltas toda la noche.', 'Una cuenta abierta clara por mesa o cliente.'],
      ['Divisiones al final', 'Pleito para repartir la cuenta.', 'División por persona o producto en segundos.'],
      ['Mermas en barra', 'Botellas que no cuadran.', 'Inventario y permisos por empleado con historial.'],
    ],
    faqs: [
      ['¿Puedo mantener cuentas abiertas mucho tiempo?', 'Sí, las cuentas se quedan abiertas por mesa o cliente hasta que decidas cobrar, con rondas rápidas.'],
      ['¿Ayuda a controlar el inventario de barra?', 'Sí, con inventario, permisos por empleado y auditoría para reducir mermas.'],
    ],
  },
  {
    slug: 'comida-rapida',
    nav: 'Comida rápida',
    metaTitle: 'Punto de Venta para Comida Rápida y Fast Food | MRTPVREST',
    metaDescription:
      'Punto de venta para comida rápida: combos, cobro veloz, kiosko de autoservicio y KDS de cocina para mover más pedidos en hora pico. Prueba 14 días gratis.',
    eyebrow: 'Giro · Comida rápida',
    h1: 'Punto de venta para comida rápida: velocidad en cada pedido',
    intro:
      'En comida rápida cada segundo cuenta. MRTPVREST arma combos al instante, suma kioskos de autoservicio para bajar filas y manda todo al KDS para que cocina no se atore en hora pico.',
    image: '/showcase-warm/kiosko.png',
    highlights: [
      { title: 'Combos al instante', text: 'Paquetes y combos con sus modificadores en un toque.' },
      { title: 'Kiosko de autoservicio', text: 'Suma puntos de cobro sin sumar cajeros y baja la fila.' },
      { title: 'KDS sin atorones', text: 'Cocina recibe cada pedido con prioridad y tiempos visibles.' },
      { title: 'Para llevar y delivery', text: 'Mostrador, autoservicio, para llevar y reparto en la misma operación.' },
    ],
    pains: [
      ['Filas largas', 'Una sola caja para toda la fila.', 'Kioskos de autoservicio que multiplican el cobro.'],
      ['Combos lentos', 'Armar el paquete tarda y se equivocan.', 'Combos preconfigurados con modificadores.'],
      ['Cocina saturada', 'Pedidos amontonados sin orden.', 'KDS con prioridad y tiempos por ticket.'],
    ],
    faqs: [
      ['¿Incluye kiosko de autoservicio?', 'Sí, el cliente ordena y paga en el kiosko y el pedido entra directo a cocina.'],
      ['¿Maneja combos y paquetes?', 'Sí, puedes armar combos con sus modificadores para cobrarlos en un toque.'],
    ],
  },
  {
    slug: 'marisqueria',
    nav: 'Marisquería',
    metaTitle: 'Punto de Venta para Marisquería | MRTPVREST',
    metaDescription:
      'Punto de venta para marisquería: mesas y cuentas familiares grandes, productos por orden o kilo, comanda a cocina y control de inventario. Prueba gratis.',
    eyebrow: 'Giro · Marisquería',
    h1: 'Punto de venta para marisquería: mesas grandes y cuentas que cuadran',
    intro:
      'La marisquería trabaja con mesas familiares, cuentas grandes y platillos por orden o por kilo. MRTPVREST ordena las mesas, manda la comanda a cocina y mantiene la cuenta clara aunque crezca durante la comida.',
    image: '/showcase-warm/kds.png',
    highlights: [
      { title: 'Mesas y comensales', text: 'Abre cuentas por mesa, agrega platillos por ronda y mueve productos entre comensales.' },
      { title: 'Por orden o por kilo', text: 'Vende mariscos por orden, media orden o por kilo con precios correctos.' },
      { title: 'Comanda a cocina', text: 'Cada platillo llega al KDS con sus notas y modificadores.' },
      { title: 'Inventario y recetas', text: 'Controla insumos y costo por platillo para cuidar el margen.' },
    ],
    pains: [
      ['Cuentas familiares enormes', 'Difícil seguir qué pidió cada quien.', 'Cuenta por mesa clara, con rondas y comensales.'],
      ['Precios por kilo', 'Cobro a ojo de mariscos por peso.', 'Venta por orden, media orden o kilo con su precio.'],
      ['Margen incierto', 'No sabes cuánto deja cada platillo.', 'Inventario y costeo de recetas por producto.'],
    ],
    faqs: [
      ['¿Puedo vender por kilo o media orden?', 'Sí, manejas precios por orden, media orden o por kilo, y todo llega claro a cocina.'],
      ['¿Sirve para mesas grandes y cuentas familiares?', 'Sí, abres cuentas por mesa, agregas rondas y mueves productos entre comensales sin perder el total.'],
    ],
  },
]

export function getVertical(slug: string) {
  return verticals.find((v) => v.slug === slug)
}
