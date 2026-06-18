export type PostSection = {
  h2: string
  paragraphs: string[]
  bullets?: string[]
}

export type RelatedLink = { href: string; label: string }

export type Post = {
  slug: string
  title: string
  metaTitle: string
  metaDescription: string
  excerpt: string
  datePublished: string
  readingMinutes: number
  intro: string[]
  sections: PostSection[]
  faqs: [string, string][]
  related: RelatedLink[]
}

export const posts: Post[] = [
  {
    slug: 'como-elegir-punto-de-venta-para-restaurante',
    title: 'Cómo elegir un punto de venta para tu restaurante',
    metaTitle: 'Cómo Elegir un Punto de Venta para Restaurante | Guía MRTPVREST',
    metaDescription:
      'Guía práctica para elegir un punto de venta para tu restaurante: qué evaluar en cobertura, costo, hardware, soporte y tiempo de arranque antes de decidir.',
    excerpt:
      'Elegir punto de venta es una decisión de años. Esta guía te da los criterios que de verdad importan para no equivocarte.',
    datePublished: '2026-06-18',
    readingMinutes: 7,
    intro: [
      'Elegir el punto de venta de tu restaurante no es una compra cualquiera: es la herramienta con la que vas a cobrar, coordinar cocina y entender tu negocio durante años. Cambiarlo después cuesta tiempo y dinero, así que vale la pena decidir bien desde el inicio.',
      'En esta guía repasamos los criterios que de verdad mueven la aguja al comparar sistemas de punto de venta para restaurantes, más allá del precio de la etiqueta.',
    ],
    sections: [
      {
        h2: 'Empieza por tu operación, no por la herramienta',
        paragraphs: [
          'Antes de ver demos, escribe cómo opera tu restaurante hoy: cuántas sucursales tienes, si hay servicio en mesa, mostrador, delivery o autoservicio, cuántos turnos manejas y dónde se te escapa el control. Esa lista es tu checklist real.',
          'Un punto de venta para taquería de mucho volumen necesita cosas distintas a una marisquería con cuentas familiares o a un bar con cuentas abiertas toda la noche. La mejor herramienta es la que encaja con tu forma de vender.',
        ],
      },
      {
        h2: 'Cobertura: que cubra toda la operación',
        paragraphs: [
          'Muchos sistemas cobran bien pero te dejan solo en cocina, en el reparto o en los reportes. Cada sistema extra que conectas a mano es una fuente de errores y de tiempo perdido.',
          'Busca una plataforma donde caja, cocina (KDS), delivery, autoservicio y administración compartan la misma información en tiempo real, para que un pedido fluya sin recapturarse.',
        ],
        bullets: [
          'Caja y mesas: cobro, cuentas, divisiones y propinas.',
          'Cocina: comandas digitales y tiempos por ticket.',
          'Delivery: repartidores, rutas y caja conciliada.',
          'Administración: ventas, inventario, recetas y permisos.',
        ],
      },
      {
        h2: 'Costo total, no solo la mensualidad',
        paragraphs: [
          'El precio mensual es solo una parte. Revisa qué incluye cada plan, si hay permanencia, si cobran comisión por pedido y cuánto cuesta el hardware o si funciona en tablets que ya tienes.',
          'Un sistema "barato" que te cobra comisión por cada pedido de delivery o que te amarra a equipo propietario puede salir más caro que uno con precio público y claro.',
        ],
      },
      {
        h2: 'Tiempo de arranque y curva de aprendizaje',
        paragraphs: [
          'Pregunta cuánto tardas en cobrar tu primera orden y qué tan acompañado es el onboarding. Un sistema que tu equipo entiende en una tarde vale más que uno lleno de funciones que nadie usa.',
          'La interfaz importa: en hora pico, botones grandes y flujos claros evitan errores y filas.',
        ],
      },
      {
        h2: 'Soporte, idioma y prueba real',
        paragraphs: [
          'Confirma que el soporte hable tu idioma y entienda la operación de un restaurante. Y antes de firmar, prueba el sistema con tu menú y tu equipo: una prueba gratis sin tarjeta te deja evaluar sin riesgo.',
        ],
      },
    ],
    faqs: [
      ['¿Qué es lo más importante al elegir un punto de venta para restaurante?', 'Que cubra toda tu operación (caja, cocina, delivery y reportes) en una sola plataforma, con un costo total claro y un arranque rápido. Probarlo con tu menú antes de decidir es clave.'],
      ['¿Conviene un punto de venta en la nube?', 'Sí, te da reportes en tiempo real y operación multisucursal; lo ideal es que la impresión de tickets sea local por red para no depender de internet en piso.'],
    ],
    related: [
      { href: '/funciones', label: 'Ver todas las funciones' },
      { href: '/comparativa/parrot', label: 'Comparar alternativas' },
      { href: '/punto-de-venta', label: 'Punto de venta por giro' },
    ],
  },
  {
    slug: 'cuanto-cuesta-un-punto-de-venta-para-restaurante',
    title: 'Cuánto cuesta un punto de venta para restaurante',
    metaTitle: 'Cuánto Cuesta un Punto de Venta para Restaurante | MRTPVREST',
    metaDescription:
      '¿Cuánto cuesta un punto de venta para restaurante? Modelos de cobro, qué incluye el precio, costos de hardware y los gastos ocultos que debes revisar.',
    excerpt:
      'Del precio mensual a las comisiones ocultas: lo que de verdad cuesta un punto de venta para restaurante y cómo presupuestarlo.',
    datePublished: '2026-06-17',
    readingMinutes: 6,
    intro: [
      'Una de las primeras preguntas al modernizar un restaurante es cuánto cuesta un punto de venta. La respuesta corta: depende del modelo de cobro y de lo que incluya. La respuesta útil es entender todas las piezas del costo para no llevarte sorpresas.',
    ],
    sections: [
      {
        h2: 'Modelos de cobro: mensualidad vs licencia',
        paragraphs: [
          'Hoy la mayoría de los sistemas de punto de venta para restaurantes cobran por suscripción mensual, que suele incluir actualizaciones y soporte. Otros venden una licencia de pago único, pero el soporte y las actualizaciones se cobran aparte.',
          'La suscripción baja la inversión inicial y mantiene el sistema al día; conviene comparar qué incluye cada plan y si el precio es público o por cotización.',
        ],
      },
      {
        h2: 'Qué debe incluir el precio',
        paragraphs: [
          'Un plan completo para restaurante debería cubrir más que el cobro. Revisa que incluya cocina, reportes y los módulos que tu operación necesita sin cargos sorpresa.',
        ],
        bullets: [
          'Punto de venta y manejo de mesas.',
          'KDS de cocina y comandas digitales.',
          'Reportes de ventas e inventario.',
          'Soporte y actualizaciones.',
        ],
      },
      {
        h2: 'Costos de hardware',
        paragraphs: [
          'El hardware puede ser una parte importante del presupuesto: tablets, impresoras de tickets, cajón de dinero y, si los usas, kioskos o pantallas de cocina.',
          'Un punto a favor es elegir un sistema que funcione en tablets Android estándar e impresoras por red, en vez de amarrarte a equipo propietario caro de reemplazar.',
        ],
      },
      {
        h2: 'Los costos ocultos que debes revisar',
        paragraphs: [
          'Aquí es donde muchos presupuestos se rompen. Antes de firmar, pregunta explícitamente por estos puntos:',
        ],
        bullets: [
          'Comisión por pedido de delivery o por tienda en línea.',
          'Permanencia o penalización por cancelar.',
          'Cargos por sucursal o por usuario adicional.',
          'Costo de migrar tus datos o tu menú.',
        ],
      },
      {
        h2: 'Cuánto invertir según tu tamaño',
        paragraphs: [
          'Un local pequeño que solo quiere ordenar caja y reportes necesita menos que un grupo con varias sucursales y delivery propio. Empieza por un plan acorde a tu operación de hoy y elige un sistema que pueda crecer contigo sin rehacer todo.',
          'Probar con una versión gratis sin tarjeta te ayuda a validar el valor antes de comprometer presupuesto.',
        ],
      },
    ],
    faqs: [
      ['¿Cuánto cuesta al mes un punto de venta para restaurante?', 'Varía según el modelo y lo que incluya el plan. Lo importante es comparar el costo total —mensualidad, hardware, comisiones y permanencia— y no solo el precio de etiqueta.'],
      ['¿Hay puntos de venta para restaurante con prueba gratis?', 'Sí. MRTPVREST, por ejemplo, ofrece 14 días gratis sin tarjeta para evaluar la plataforma con tu menú antes de decidir.'],
    ],
    related: [
      { href: '/#precios', label: 'Ver precios de MRTPVREST' },
      { href: '/funciones', label: 'Qué incluye cada función' },
      { href: '/comparativa/loyverse', label: 'Comparar con otras opciones' },
    ],
  },
  {
    slug: 'que-es-un-kds-de-cocina',
    title: 'Qué es un KDS y por qué tu cocina lo necesita',
    metaTitle: 'Qué es un KDS de Cocina para Restaurantes | MRTPVREST',
    metaDescription:
      'Qué es un KDS (Kitchen Display System): cómo funciona la pantalla de cocina, sus beneficios frente a las comandas en papel y cuándo conviene en tu restaurante.',
    excerpt:
      'El KDS reemplaza las comandas en papel por una pantalla de cocina conectada. Qué es, cómo funciona y cuándo conviene.',
    datePublished: '2026-06-16',
    readingMinutes: 5,
    intro: [
      'Si has escuchado el término KDS y no estás seguro de qué significa, no eres el único. KDS son las siglas en inglés de Kitchen Display System, o sistema de pantalla de cocina. En pocas palabras: es la pantalla que muestra los pedidos en la cocina en lugar de las comandas en papel.',
    ],
    sections: [
      {
        h2: 'Qué es un KDS',
        paragraphs: [
          'Un KDS es una pantalla conectada al punto de venta que recibe cada pedido en tiempo real. En cuanto se cobra o se manda una orden —desde mesa, mostrador, delivery o autoservicio— aparece en la cocina con sus productos, modificadores y notas.',
          'Sustituye al ticket impreso y al sistema de "cantar" la comanda, dos fuentes clásicas de errores y de pedidos perdidos.',
        ],
      },
      {
        h2: 'Cómo funciona en el día a día',
        paragraphs: [
          'El flujo es simple: el mesero o el cajero envía el pedido, este llega al KDS ordenado por prioridad, la cocina lo prepara y, al terminar, lo marca como listo. Ese aviso vuelve a la sala o a la operación para que el platillo salga a tiempo.',
          'En cocinas con varias estaciones, el KDS puede separar el flujo para que cada estación vea solo lo que le toca.',
        ],
      },
      {
        h2: 'Beneficios frente a las comandas en papel',
        paragraphs: [
          'Los beneficios se notan rápido en hora pico:',
        ],
        bullets: [
          'Ningún pedido se traspapela: queda en pantalla hasta marcarse listo.',
          'Menos errores: modificadores y notas claros y legibles.',
          'Control de tiempos: ves qué ticket lleva esperando demasiado.',
          'Cocina y sala sincronizadas con una sola verdad del pedido.',
        ],
      },
      {
        h2: 'Cuándo conviene un KDS',
        paragraphs: [
          'Si tu cocina maneja volumen, varios canales (mesa, delivery, autoservicio) o más de una estación, un KDS deja de ser un lujo y se vuelve una herramienta de control. Funciona igual para comida rápida que para servicio en mesa, porque todos los canales alimentan la misma pantalla.',
        ],
      },
    ],
    faqs: [
      ['¿Qué significa KDS?', 'KDS son las siglas de Kitchen Display System, o sistema de pantalla de cocina: la pantalla que muestra los pedidos en cocina en lugar de las comandas en papel.'],
      ['¿El KDS sirve para comida rápida y para servicio en mesa?', 'Sí. Funciona para mostrador, servicio en mesa, delivery y autoservicio, porque todos los canales mandan sus pedidos a la misma pantalla.'],
    ],
    related: [
      { href: '/funciones/kds-cocina', label: 'Conoce el KDS de MRTPVREST' },
      { href: '/funciones', label: 'Ver todas las funciones' },
      { href: '/punto-de-venta/comida-rapida', label: 'Punto de venta para comida rápida' },
    ],
  },
  {
    slug: 'como-reducir-mermas-en-tu-restaurante',
    title: 'Cómo reducir mermas en tu restaurante',
    metaTitle: 'Cómo Reducir Mermas en tu Restaurante | Guía MRTPVREST',
    metaDescription:
      'Cómo reducir mermas en tu restaurante: causas comunes, control de inventario y recetas, permisos por empleado y cómo medir tu food cost para cuidar el margen.',
    excerpt:
      'Las mermas se comen tu margen en silencio. Cómo detectarlas y controlarlas con inventario, recetas y permisos.',
    datePublished: '2026-06-15',
    readingMinutes: 6,
    intro: [
      'Las mermas son ese costo que no se ve en la caja pero que se come tu margen: producto que se echa a perder, porciones sin control, faltantes en barra o regalos no registrados. Reducirlas es una de las formas más directas de mejorar la rentabilidad sin subir precios.',
    ],
    sections: [
      {
        h2: 'Qué son las mermas y de dónde salen',
        paragraphs: [
          'La merma es la diferencia entre lo que compraste y lo que realmente vendiste o usaste. Una parte es normal (limpieza, cocción), pero otra es evitable y suele esconderse en la operación diaria.',
        ],
        bullets: [
          'Porciones sin estandarizar que varían entre cocineros.',
          'Producto caducado por mala rotación.',
          'Faltantes en barra o cocina sin registro.',
          'Extras y cortesías que se regalan sin cobrarse.',
        ],
      },
      {
        h2: 'Controla inventario y recetas',
        paragraphs: [
          'No puedes controlar lo que no mides. Llevar inventario y costear tus recetas te dice cuánto insumo debería consumir cada platillo y te deja comparar contra el consumo real.',
          'Cuando el punto de venta descuenta inventario por receta al vender, las diferencias saltan a la vista y puedes actuar antes de que se vuelvan un hueco grande.',
        ],
      },
      {
        h2: 'Permisos y auditoría por empleado',
        paragraphs: [
          'Buena parte de las mermas evitables se relacionan con descuentos, cancelaciones o cortesías sin control. Con permisos por rol y un historial auditable, defines quién puede hacer qué y queda registro de cada movimiento.',
        ],
      },
      {
        h2: 'Mide tu food cost',
        paragraphs: [
          'El food cost —el costo de los insumos como porcentaje de la venta— es tu termómetro. Si lo mides por platillo, detectas cuáles te dejan margen y cuáles te lo quitan, y puedes ajustar porciones, precios o proveedores con datos.',
          'Revisar el food cost de forma constante convierte el control de mermas en un hábito, no en una emergencia de fin de mes.',
        ],
      },
    ],
    faqs: [
      ['¿Cómo ayuda un punto de venta a reducir mermas?', 'Al llevar inventario, costear recetas y descontar insumos por venta, el sistema revela las diferencias entre el consumo esperado y el real, y con permisos por empleado controla descuentos y cancelaciones.'],
      ['¿Qué es el food cost?', 'Es el costo de los insumos de un platillo expresado como porcentaje de su precio de venta; sirve para saber cuánto margen real deja cada producto.'],
    ],
    related: [
      { href: '/funciones/administracion', label: 'Administración, inventario y recetas' },
      { href: '/punto-de-venta/bar', label: 'Punto de venta para bar' },
      { href: '/funciones', label: 'Ver todas las funciones' },
    ],
  },
  {
    slug: 'delivery-propio-vs-plataformas',
    title: 'Delivery propio vs plataformas: qué conviene a tu restaurante',
    metaTitle: 'Delivery Propio vs Plataformas para Restaurantes | MRTPVREST',
    metaDescription:
      'Delivery propio vs plataformas de reparto: el costo de las comisiones, las ventajas del reparto propio y cómo combinarlos para cuidar tu margen y tus clientes.',
    excerpt:
      'Las plataformas dan alcance pero se llevan tu margen. Cuándo conviene el delivery propio y cómo combinar ambos.',
    datePublished: '2026-06-14',
    readingMinutes: 6,
    intro: [
      'El delivery se volvió parte central de muchos restaurantes, y con él la pregunta de siempre: ¿conviene repartir con plataformas o montar tu propio delivery? No hay una respuesta única, pero sí criterios claros para decidir según tu negocio.',
    ],
    sections: [
      {
        h2: 'El costo real de las plataformas',
        paragraphs: [
          'Las plataformas de reparto te dan alcance y clientes nuevos sin que tengas que conseguir repartidores, pero cobran una comisión por cada pedido que puede ser alta. En platillos de margen ajustado, esa comisión se come buena parte de la utilidad.',
          'Además, el cliente es de la plataforma, no tuyo: no tienes sus datos para volver a venderle directamente.',
        ],
      },
      {
        h2: 'Ventajas del delivery propio',
        paragraphs: [
          'Montar tu propio reparto cambia la ecuación: te quedas con el margen completo, eres dueño de la relación con el cliente y controlas la experiencia de principio a fin.',
        ],
        bullets: [
          'Sin comisión por pedido.',
          'Datos del cliente para fidelizar y volver a vender.',
          'Control de tiempos y calidad de la entrega.',
          'Caja del repartidor conciliada con tu operación.',
        ],
      },
      {
        h2: 'Los retos del reparto propio',
        paragraphs: [
          'El delivery propio también tiene su lado difícil: necesitas repartidores, coordinar rutas y conciliar el efectivo que manejan. Sin herramientas, esto se vuelve un caos de hojas de cálculo y cuentas que no cuadran.',
          'Aquí es donde un sistema que conecte el pedido, al repartidor y su caja hace la diferencia entre un reparto rentable y uno que te genera huecos.',
        ],
      },
      {
        h2: 'Cómo combinar ambos',
        paragraphs: [
          'Para muchos restaurantes la mejor estrategia es híbrida: usar plataformas para captar clientes nuevos y empujar tu delivery propio (por WhatsApp, QR o tienda en línea) para los recurrentes, donde el margen importa más.',
          'Lo importante es que tu punto de venta reciba todos esos pedidos en una sola operación, sin recapturar y con la cocina y la caja sincronizadas.',
        ],
      },
    ],
    faqs: [
      ['¿Es mejor el delivery propio o las plataformas?', 'Depende de tu margen y tus objetivos. Las plataformas dan alcance a cambio de comisión; el delivery propio conserva el margen y la relación con el cliente. Muchos restaurantes combinan ambos.'],
      ['¿Qué necesito para operar delivery propio?', 'Una forma de recibir pedidos (tienda en línea, QR o WhatsApp), una app para tus repartidores y un sistema que concilie la caja del repartidor con tu operación.'],
    ],
    related: [
      { href: '/funciones/delivery', label: 'Delivery de MRTPVREST' },
      { href: '/funciones/app-cliente', label: 'Tienda en línea y pedidos QR' },
      { href: '/punto-de-venta/pizzeria', label: 'Punto de venta para pizzería' },
    ],
  },
]

export function getPost(slug: string) {
  return posts.find((p) => p.slug === slug)
}
