# M03: contrato inicial de descubrimiento

22 de octubre de 2026. Propuesta implementable de este coordinador basada en M01/M02.
La revisara Claude en paralelo a la implementacion local de Codex. No autoriza
publicacion de tiendas reales ni modifica los endpoints existentes de pedidos.

## Publicacion explicita y alcance

No existe campo de consentimiento de marketplace en el esquema revisado.
Para esta fase local usar una lista **server-side** MARKETPLACE_STORE_SLUGS,
vacia por defecto. Solo restaurantes incluidos expresamente, isActive=true y con
Tenant.hasWebStore=true pueden aparecer. No inferir consentimiento de hasWebStore.
Excluir tenants isDemo=true del listado normal. Pruebas usan objetos sinteticos
sin consultar BD; una futura demostracion debe estar identificada como tal.
Una futura politica comercial de alta requiere decision propia antes de publicar.

Nunca aceptar del navegador una ampliacion de esa lista ni IDs de tenant.
Sin lista configurada devolver un catalogo vacio sin consultar BD. Las rutas de
tienda por slug existentes mantienen su alcance: no se convierten en directorio.

## HTTP y consultas

GET `/api/marketplace/stores?q=&businessType=&page=1&pageSize=12`

- q: texto recortado, maximo 80 caracteres; busca nombre de tienda, sin distinguir
  mayusculas. Recortado significa trim de espacios, nunca truncar una consulta
  mayor a 80: devolver 400 INVALID_QUERY. Ausente o vacio no agrega filtro de nombre.
  No interpretar SQL ni expresiones regulares; los caracteres de busqueda son literales.
- businessType: opcional, valor exacto RESTAURANT, RETAIL o GROCERY.
- page entero 1..10000; pageSize entero 1..24, default 12. Rechazar arrays, objetos,
  duplicados interpretados como arrays, negativos, decimales y parametros invalidos
  con 400 INVALID_QUERY. Ignorar solo parametros desconocidos inocuos.
- Orden estable por name asc, id asc. Aplicar filtros antes de contar y paginar.
- No limitar silenciosamente (clamp) parametros invalidos. Una pagina valida por
  encima del numero de resultados devuelve 200, items=[] y total real, no 404.
- Respuesta `{ items: StoreSummary[], page, pageSize, total }`.
- StoreSummary: `{ slug, name, businessType }`. No necesita id/tenantId, contactos
  ni imagenes externas para esta primera entrega. El cliente construye enlace
  relativo `/${encodeURIComponent(slug)}` y valida slug de un solo segmento.

GET `/api/marketplace/products?q=&store=&page=1&pageSize=12`

- Misma validacion de q/page/pageSize; store opcional es slug validado de un solo
  segmento (`^[a-z0-9-]{1,100}$`). Ausente o cadena vacia significa sin filtro;
  cualquier otro formato, array u objeto produce 400 INVALID_QUERY. Un slug no incluido
  o inactivo produce lista vacia, sin revelar si existe como tienda privada.
- Busca nombre de producto; filtros a restaurantId dentro del conjunto permitido,
  isAvailable=true, availableOnline=true y categoria activa del mismo restaurante.
- Orden name asc, id asc; respuesta con el mismo envelope.
- ProductSummary: `{ id, name, categoryName, price, currency, store: { slug, name } }`.
  price es precio BASE finito y no negativo; currency ISO de RestaurantConfig
  validada, default MXN cuando no exista configuracion. No prometer promociones,
  precio final, disponibilidad de variantes ni stock en tiempo real.
- Sin detalle global nuevo: el CTA lleva al storefront existente de esa tienda.
  No enviar al cliente recetas, costos, codigos de barras, inventario, tenantId,
  impresoras, claves ni objetos Prisma completos.

`200` con items=[] significa sin resultados. Fallos del adaptador/BD devuelven
`503 { error: "Catalogo temporalmente no disponible", errorCode: "CATALOG_UNAVAILABLE" }`;
no convertirlos en listas vacias ni incluir errores internos. Usar Cache-Control:
no-store. Ningun POST/PUT/DELETE, login o carrito global forma parte de este contrato.
Errores de timeout que reporte el adaptador tambien son 503, sin reintentos internos.
Esta primera version no garantiza un plazo global de respuesta; documentar el
timeout del driver/BD antes de integracion real. No introducir un Promise.race que
finja cancelar una consulta de BD que sigue ejecutandose.

## Implementacion y aislamiento de tenants

- Modulo puro con adaptador inyectado para pruebas; el router Express conecta ese
  modulo a Prisma. No importar index.js para probar ni realizar llamadas reales.
- Resolver restaurantes elegibles con select explicito. Todas las consultas de
  Category/MenuItem/RestaurantConfig incluyen restaurantId real resuelto del servidor.
  Mantener tenant guard; si se necesita bypass para el directorio, limitarlo a la
  operacion deliberada y documentada, conservar filtros y probar exclusiones.
- No reutilizar respuesta completa de `/api/store/info` o `/menu`; seleccionar y
  proyectar solo los campos del contrato. No N+1 sin limite: limitar la configuracion
  local a un maximo razonable (100 slugs) y consultar/paginar en BD o documentar coste.
- No editar schema, instalar dependencias, migrar ni conectar una base real.

## Aceptacion M06

Pruebas offline con fixtures A/B incluyen: lista vacia sin llamar adaptador;
exclusion de restaurante no autorizado/inactivo/sin webstore/demo; producto de
otra tienda, oculto online/no disponible/categoria inactiva; parametros invalidos;
busqueda, conteo y paginacion estable; proyeccion sin campos privados; fallo 503.
Probar ademas que el adaptador conserva filtros y selects, sin importar Prisma real.

## Aceptacion M05

Portada con secciones tiendas/productos, busqueda conservada en URL y paginacion
independiente; filtro de negocio solo afecta tiendas, filtro store solo productos
y etiquetas lo explican. Errores y vacios independientes. Enlaces locales de
documento completo para evitar compartir el carrito en memoria entre tiendas.
No requiere imagenes externas ni datos ficticios. Integracion visual pendiente
hasta cerrar los requisitos de arranque.

## Extensión aditiva para la portada estilo app (22–23 oct)

Campos nuevos, todos públicos y derivados de lo que ya expone `/api/store/info`;
los clientes anteriores los ignoran. El cliente los valida estrictamente.

StoreSummary agrega:

- `isOpen`: misma regla que `/api/store/info` (`computeOpenState`: override manual
  y horario automático). Sin `RestaurantConfig`, la tienda está cerrada.
- `closedMessage`: mensaje de horario o el manual; `null` si está abierta.
- `estimatedDelivery`: minutos enteros > 0, o `null`. El cliente muestra ±5 min.
- `deliveryFee`: solo con `deliveryMode` FLAT; `null` en DISTANCE/ZONES porque
  depende de la dirección ("Envío según distancia").
- `freeDeliveryFrom`, `minOrderAmount`: montos finitos ≥ 0 o `null`.

ProductSummary agrega:

- `promoPrice`: solo si `isPromo`, es menor que `price` y su ventana horaria
  (`itemPromoWindowOpen`, override por producto o global de la tienda) está
  abierta ahora; si no, `null`. El precio final lo sigue calculando la tienda.
- `likes`: conteo de reacciones ("me gusta") del producto.

`businessType` acepta además HARDWARE y AUTOPARTS, que el cliente ofrece como
filtros; sin tiendas de ese tipo la respuesta es 200 con `items=[]`.
No se exponen contacto, horario completo, tarifas por km ni datos de tenant.
