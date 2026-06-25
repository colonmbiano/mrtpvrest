export type Feature = {
  slug: string
  nav: string
  metaTitle: string
  metaDescription: string
  eyebrow: string
  h1: string
  intro: string
  image: string
  bullets: { title: string; text: string }[]
  pains: [string, string, string][]
  faqs: [string, string][]
}

export const features: Feature[] = [
  {
    slug: 'punto-de-venta',
    nav: 'Punto de venta (TPV)',
    metaTitle: 'Punto de Venta para Restaurantes (TPV) | MRTPVREST',
    metaDescription:
      'Software de punto de venta para restaurantes: cobra, gestiona mesas, divide cuentas y cierra caja desde una tablet. Prueba 14 días gratis, sin tarjeta.',
    eyebrow: 'TPV · Punto de venta',
    h1: 'El punto de venta para restaurantes que cobra a la velocidad de tu servicio',
    intro:
      'MRTPVREST es el software de punto de venta para restaurantes pensado para horas pico: cobro táctil en una pantalla, mesas, cuentas divididas, propinas y cierre de caja, todo conectado en tiempo real con cocina y administración.',
    image: '/showcase-warm/tpv.png',
    bullets: [
      { title: 'Cobro en una pantalla', text: 'Productos, modificadores, descuentos y pago en efectivo, tarjeta o transferencia sin saltar entre apps.' },
      { title: 'Mesas y cuentas', text: 'Abre cuentas por mesa, une o divide cuentas y mueve productos entre comensales sin perder el control.' },
      { title: 'Caja y turnos', text: 'Apertura y cierre de caja con corte ciego, ingresos de efectivo y arqueo por turno y por empleado.' },
      { title: 'Funciona en tablet', text: 'Botones grandes pensados para piso. La impresión a tickets es local por red, no depende de la nube.' },
    ],
    pains: [
      ['Cobro lento', 'Filas en caja y pantallas confusas en hora pico.', 'Flujo táctil directo: del producto al pago en segundos.'],
      ['Cuentas que no cuadran', 'Divisiones a mano y errores de propina.', 'Divide, une y reconcilia cuentas con totales calculados en el servidor.'],
      ['Caja a ciegas', 'No sabes cuánto vendiste hasta cerrar.', 'Ventas, caja y turnos visibles al minuto.'],
    ],
    faqs: [
      ['¿El punto de venta funciona sin internet?', 'El TPV mantiene la operación en piso y sincroniza cuando vuelve la conexión; la impresión de tickets es local por red.'],
      ['¿Puedo dividir y unir cuentas?', 'Sí. Puedes dividir por comensal o por producto, unir cuentas de varias mesas y mover productos entre cuentas abiertas.'],
      ['¿Necesito hardware especial?', 'Funciona en tablets Android estándar e impresoras de tickets por red local. No te amarra a un equipo propietario.'],
    ],
  },
  {
    slug: 'kds-cocina',
    nav: 'KDS de cocina',
    metaTitle: 'KDS: Pantalla de Cocina para Restaurantes | MRTPVREST',
    metaDescription:
      'Sistema de comandas digital (KDS) que muestra cada pedido en cocina al instante, ordena por estación y baja los errores de servicio. Pruébalo gratis.',
    eyebrow: 'KDS · Pantalla de cocina',
    h1: 'KDS: la cocina recibe cada comanda al instante, sin papeles',
    intro:
      'El KDS de MRTPVREST reemplaza las comandas en papel por una pantalla de cocina conectada. Lo que entra por mesa, mostrador, delivery o kiosko aparece en cocina en tiempo real, ordenado por prioridad y estación.',
    image: '/showcase-warm/kds.png',
    bullets: [
      { title: 'Comandas en tiempo real', text: 'Cada pedido del TPV, delivery o kiosko llega a la pantalla de cocina sin que nadie cruce palabra.' },
      { title: 'Tiempos y prioridad', text: 'Visualiza cuánto lleva cada ticket para que ningún pedido se quede atrás en hora pico.' },
      { title: 'Menos errores', text: 'Modificadores y notas claros en pantalla bajan los reprocesos y las quejas en sala.' },
      { title: 'Listo en un toque', text: 'Marca un platillo o ticket como listo y el aviso vuelve al mesero y a la operación.' },
    ],
    pains: [
      ['Comandas perdidas', 'Tickets de papel que se traspapelan o se borran.', 'Cada comanda queda en pantalla hasta marcarse lista.'],
      ['Cocina y sala desconectadas', 'Gritos, notas sueltas y dobles preparaciones.', 'Una sola verdad del pedido para sala, cocina y caja.'],
      ['Sin control de tiempos', 'No sabes qué mesa lleva esperando demasiado.', 'Cronómetro por ticket y prioridad visible.'],
    ],
    faqs: [
      ['¿El KDS sirve para comida rápida y servicio en mesa?', 'Sí. Funciona igual para mostrador, servicio en mesa, delivery y autoservicio, porque todos los canales alimentan la misma pantalla.'],
      ['¿Puedo tener varias pantallas por estación?', 'Sí, puedes separar el flujo por estación de cocina para que cada una vea solo lo que le toca.'],
    ],
  },
  {
    slug: 'delivery',
    nav: 'Delivery',
    metaTitle: 'Software de Delivery para Restaurantes | MRTPVREST',
    metaDescription:
      'Gestiona delivery propio conectado al punto de venta: pedidos, repartidores, rutas y corte de caja del repartidor en un solo sistema. Prueba gratis.',
    eyebrow: 'Delivery · Reparto propio',
    h1: 'Delivery propio conectado con tu caja y tu cocina',
    intro:
      'MRTPVREST conecta el reparto con la operación: el pedido entra, cocina lo prepara, el repartidor lo lleva y su caja se concilia al cierre, sin hojas de cálculo ni cuentas sueltas.',
    image: '/showcase-warm/delivery.png',
    bullets: [
      { title: 'Pedidos a domicilio', text: 'Toma pedidos de delivery desde el TPV o la tienda en línea y mándalos directo a cocina.' },
      { title: 'App de repartidor', text: 'Cada repartidor ve sus entregas, marca estados y registra cobros desde su teléfono.' },
      { title: 'Caja del repartidor', text: 'Corte de caja por repartidor con efectivo, transferencias, gastos y envíos conciliados.' },
      { title: 'Rutas en mapa', text: 'Ubica entregas en mapa para ordenar el reparto sin costos de mapas premium.' },
    ],
    pains: [
      ['Reparto descontrolado', 'No sabes qué pedido va con quién.', 'Cada entrega asignada y rastreada por repartidor.'],
      ['Caja que no cierra', 'El efectivo del reparto se reconcilia a mano.', 'Corte de caja del repartidor automático y auditable.'],
      ['Pedidos perdidos', 'Domicilios anotados en papel.', 'El pedido de delivery fluye del TPV a cocina y a la entrega.'],
    ],
    faqs: [
      ['¿Sirve para delivery propio o de plataformas?', 'Está pensado para tu reparto propio, con control total del pedido, el repartidor y su caja.'],
      ['¿Cómo se concilia el efectivo del repartidor?', 'Cada repartidor cierra su caja con ventas, gastos y envíos, y el corte queda ligado a sus pedidos.'],
    ],
  },
  {
    slug: 'kiosko',
    nav: 'Kiosko de autoservicio',
    metaTitle: 'Kiosko de Autoservicio para Restaurantes | MRTPVREST',
    metaDescription:
      'Kiosko de autoservicio que toma pedidos y cobra solo, manda la orden a cocina y reduce filas en horas pico. Conéctalo a tu punto de venta. Prueba gratis.',
    eyebrow: 'Kiosko · Autoservicio',
    h1: 'Kiosko de autoservicio para mover más pedidos en hora pico',
    intro:
      'El kiosko de MRTPVREST deja que el cliente ordene y pague solo. El pedido entra directo a cocina y a tu punto de venta, así bajas filas sin sumar personal.',
    image: '/showcase-warm/kiosko.png',
    bullets: [
      { title: 'Pedido autoservicio', text: 'El cliente arma su pedido, elige modificadores y paga sin esperar en caja.' },
      { title: 'Directo a cocina', text: 'Cada orden del kiosko llega al KDS como cualquier otro canal, sin recapturar.' },
      { title: 'Menos filas', text: 'Suma capacidad de cobro en hora pico sin contratar más cajeros.' },
      { title: 'Tu menú, tu marca', text: 'Muestra el mismo catálogo y disponibilidad que el resto de la operación.' },
    ],
    pains: [
      ['Filas en caja', 'Clientes que se van por la espera.', 'Varios puntos de cobro en autoservicio.'],
      ['Errores de captura', 'El cliente repite el pedido y aún sale mal.', 'El cliente arma su orden tal cual la quiere.'],
      ['Menú desincronizado', 'El kiosko ofrece lo que ya se acabó.', 'Catálogo y disponibilidad compartidos con el TPV.'],
    ],
    faqs: [
      ['¿El kiosko cobra solo?', 'Sí, el cliente puede pagar en el kiosko y el pedido entra a cocina automáticamente.'],
      ['¿Usa el mismo menú que el punto de venta?', 'Sí, comparte catálogo y disponibilidad con el resto de las apps de la operación.'],
    ],
  },
  {
    slug: 'app-cliente',
    nav: 'App de cliente y QR',
    metaTitle: 'App de Cliente y Pedidos QR para Restaurantes | MRTPVREST',
    metaDescription:
      'Tienda en línea y pedidos por QR para tu restaurante: el cliente ordena desde su teléfono y la orden entra a tu punto de venta y cocina. Prueba gratis.',
    eyebrow: 'App cliente · Pedidos QR',
    h1: 'Pedidos por QR y tienda en línea, conectados a tu operación',
    intro:
      'Con MRTPVREST el cliente pide desde su teléfono —por QR en la mesa o por tu tienda en línea— y el pedido entra directo a tu punto de venta y a cocina, sin intermediarios ni comisiones por orden.',
    image: '/showcase-warm/app-cliente.png',
    bullets: [
      { title: 'Pedido por QR', text: 'El cliente escanea, pide y paga desde la mesa sin descargar nada.' },
      { title: 'Tienda en línea propia', text: 'Tu menú online con tu marca, sin comisión por pedido de plataformas.' },
      { title: 'Conectado al TPV', text: 'Los pedidos online entran a la misma operación y se imprimen en cocina.' },
      { title: 'Puntos y clientes', text: 'Registra clientes y suma puntos para que vuelvan, no solo para que compren una vez.' },
    ],
    pains: [
      ['Comisiones altas', 'Las plataformas se llevan parte de cada pedido.', 'Tu tienda en línea propia, sin comisión por orden.'],
      ['Pedidos manuales', 'Capturas a mano lo que llega por WhatsApp.', 'El pedido del cliente entra solo al TPV y a cocina.'],
      ['Clientes anónimos', 'No sabes quién te compra ni cómo volver a venderle.', 'Cuentas de cliente y puntos para fidelizar.'],
    ],
    faqs: [
      ['¿El cliente necesita descargar una app?', 'No. Puede pedir desde el navegador por QR o desde tu tienda en línea.'],
      ['¿Los pedidos online entran solos al sistema?', 'Sí, llegan al punto de venta y se imprimen en cocina como cualquier otro pedido.'],
    ],
  },
  {
    slug: 'administracion',
    nav: 'Administración y reportes',
    metaTitle: 'Administración, Inventario y Reportes para Restaurantes | MRTPVREST',
    metaDescription:
      'Panel de administración para restaurantes: reportes de ventas, inventario, recetas, roles y permisos por empleado y control multisucursal. Prueba gratis.',
    eyebrow: 'Admin · Reportes',
    h1: 'Administra ventas, inventario y equipo desde un solo panel',
    intro:
      'El panel de administración de MRTPVREST te da la lectura del negocio: reportes de ventas en tiempo real, inventario y recetas, roles y permisos por empleado, y control de varias sucursales desde la web.',
    image: '/showcase-warm/admin.png',
    bullets: [
      { title: 'Reportes en vivo', text: 'Ventas, caja, productos y turnos al minuto, no al final del día.' },
      { title: 'Inventario y recetas', text: 'Controla insumos y costo por receta para saber tu margen real por platillo.' },
      { title: 'Roles y permisos', text: 'Cada empleado ve y hace solo lo que le toca, con historial auditable.' },
      { title: 'Multisucursal', text: 'Compara y administra varias sucursales desde un mismo lugar.' },
    ],
    pains: [
      ['Negocio a ciegas', 'Ventas en cuaderno, Excel y memoria.', 'Dashboard vivo con ventas, caja y turnos.'],
      ['Sin control de costos', 'No sabes cuánto deja cada platillo.', 'Inventario y costeo de recetas por producto.'],
      ['Permisos confusos', 'Todos pueden tocar todo.', 'Roles, permisos y auditoría por empleado.'],
    ],
    faqs: [
      ['¿Puedo administrar varias sucursales?', 'Sí, el panel permite operar y comparar varias sucursales desde la web.'],
      ['¿Controla inventario y costos?', 'Sí, maneja insumos, recetas y costo por platillo para ver tu margen real.'],
    ],
  },
  {
    slug: 'facturacion',
    nav: 'Facturación por QR',
    metaTitle: 'Punto de Venta con Facturación para Restaurantes (Autofactura QR) | MRTPVREST',
    metaDescription:
      'Punto de venta con autofactura por QR: el ticket imprime RFC, folio y un QR para que tus clientes obtengan su factura (CFDI) desde tu portal. Prueba gratis.',
    eyebrow: 'Facturación · Autofactura QR',
    h1: 'Facturación para tus clientes con autofactura por QR',
    intro:
      'MRTPVREST imprime en el ticket los datos fiscales del emisor y un bloque de autofactura: un QR y un folio que llevan a tu portal de facturación, donde el cliente obtiene su CFDI desde su teléfono, sin hacer fila en caja.',
    image: '/showcase-warm/tpv.png',
    bullets: [
      { title: 'Autofactura por QR', text: 'El recibo incluye un QR de "¿Quieres tu factura?" que envía al cliente a tu portal de facturación para timbrar su CFDI.' },
      { title: 'RFC y giro en el ticket', text: 'Configura el RFC y el giro del emisor para que aparezcan en el encabezado fiscal del recibo.' },
      { title: 'Folio por orden', text: 'Un prefijo más el número de orden forman el folio (ej. MB-00123) para identificar cada comprobante.' },
      { title: 'Sin filas para facturar', text: 'El cliente factura desde su teléfono cuando quiera; tu caja no se traba atendiendo facturas.' },
    ],
    pains: [
      ['Filas para facturar', 'Clientes esperando en caja por su factura.', 'Autofactura por QR: el cliente factura desde su teléfono.'],
      ['Datos fiscales a mano', 'Capturas RFC y folios uno por uno.', 'RFC, giro y folio impresos en cada ticket.'],
      ['Facturación desconectada', 'El portal de facturas vive aparte del cobro.', 'El ticket lleva el QR directo a tu portal de facturación.'],
    ],
    faqs: [
      ['¿MRTPVREST timbra mis facturas (CFDI)?', 'MRTPVREST imprime en el ticket un QR y folio que llevan a tu portal de facturación, donde tu cliente obtiene su CFDI. El timbrado lo realiza tu proveedor o portal de facturación, no el punto de venta.'],
      ['¿Qué necesito para activar la autofactura por QR?', 'Configura en los ajustes del ticket el RFC del emisor, el prefijo de folio y la URL de tu portal de facturación; el recibo empieza a imprimir el bloque de factura con su QR.'],
    ],
  },
  {
    slug: 'asistente-de-voz',
    nav: 'Asistente de voz',
    metaTitle: 'Punto de Venta con Asistente de Voz para Restaurantes | MRTPVREST',
    metaDescription:
      'Toma pedidos hablando: el cajero dicta, el punto de venta arma el ticket y él lo revisa y confirma. Entiende español de México, vende por peso y corrige por voz. Prueba gratis.',
    eyebrow: 'TPV · Asistente de voz',
    h1: 'Toma pedidos hablando: tu punto de venta ahora entiende la voz',
    intro:
      'El asistente de voz de MRTPVREST deja que el cajero dicte el pedido y el sistema lo arme solo. Antes de cobrar, una hoja de revisión muestra qué entendió para confirmarlo o corregirlo de un toque. Menos tecleo, menos errores de captura y más velocidad en hora pico.',
    image: '/showcase-warm/asistente-de-voz.png',
    bullets: [
      { title: 'Dicta el pedido natural', text: '«dos hamburguesas y una coca» entra al ticket al instante, con cantidades, variantes y modificadores.' },
      { title: 'Revisa antes de cobrar', text: 'Una hoja muestra lo que entendió; ajusta cantidad, tamaño o extras de un toque. Nada entra a ciegas al ticket.' },
      { title: 'Vende por peso hablando', text: 'Para productos de báscula entiende «medio kilo de alitas» y cobra el precio por kilo exacto.' },
      { title: 'Corrige con la voz', text: '«quita la coca», «que sea grande», «otra de pastor»: ajusta el pedido sin tocar la pantalla.' },
    ],
    pains: [
      ['Captura lenta en hora pico', 'El cajero teclea producto por producto mientras crece la fila.', 'Dicta el pedido y el sistema arma el ticket en segundos.'],
      ['Errores de pedido', 'Productos mal capturados que terminan en mermas y quejas.', 'Revisas lo que entendió antes de cobrar y corriges al instante.'],
      ['Dictados que no entienden el menú', 'Las dictadoras genéricas no captan cómo se pide aquí.', 'Reconoce español de México: «una chela», «media docena», marcas y tamaños.'],
    ],
    faqs: [
      ['¿Necesito internet o un micrófono especial?', 'Funciona con el micrófono de la misma tablet del punto de venta y el reconocimiento de voz del dispositivo. No necesitas hardware adicional.'],
      ['¿Qué pasa si entiende mal un producto?', 'Antes de agregar al ticket ves una hoja de revisión con lo que entendió. Ahí ajustas cantidad, variante, modificadores o lo quitas, y lo que no reconoció lo agregas a mano. Nada se cobra sin tu confirmación.'],
      ['¿Entiende cómo pedimos en México?', 'Sí. Reconoce coloquialismos y marcas («una coca», «una chela»), cantidades habladas como «media docena», tamaños como «grande» o «chico» y venta por peso como «medio kilo».'],
      ['¿Funciona con cualquier menú?', 'Sí. Reconoce los productos de tu propio menú en español de México. Entre más completo tu catálogo —variantes y modificadores—, mejor arma el pedido.'],
    ],
  },
]

export function getFeature(slug: string) {
  return features.find((f) => f.slug === slug)
}
