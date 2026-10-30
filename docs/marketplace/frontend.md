# M02: recorrido de compradores

22 de octubre de 2026. Informe completado por este chat, no por Antigravity.
Su intento Orca task_ded02f14729b / ctx_3e4aa229905e termino con aviso explicito
de cuota tras leer instrucciones y sin producir archivo. El coordinador cerro
el intento como abandoned, conservando la terminal, antes de asumir este archivo.

## Lo existente

- `apps/client/src/app/page.tsx:5` redirige la raiz a https://mrtpvrest.com.
  No existe portada de marketplace ni directorio global.
- `src/app/[slug]/page.tsx:129` obtiene tienda, menu y sucursales; devuelve
  notFound si no existe o hasWebStore es falso. Maneja tienda cerrada y temas
  Mochi, Beverage, Mundialista y Antojitos. Reutilizar la ruta de tienda.
- `src/lib/store-data.ts:59` distingue 404 de errores de red en fetchStore,
  pero fetchMenu (`:72`) y fetchLocations (`:85`) convierten fallos en listas
  vacias. No copiar esa ambiguedad en el catalogo global.
- `[slug]/error.tsx` ofrece reintento; `[slug]/not-found.tsx` diferencia tienda
  inexistente. Ambos necesitan navegacion de regreso al catalogo.
- `src/middleware.ts:3` reescribe hosts de clientes a /[slug]; localhost y 127
  quedan excluidos. Revisar hosts de staging antes de habilitarlos; no adivinarlos.
- `package.json` declara Next 16.2.9 y React 19.2.7 (CLAUDE.md menciona una version
  antigua). Ya existen Tailwind, Lucide y Zustand: no hacen falta nuevas librerias.
  No se encontraron archivos de pruebas propios en apps/client durante este inventario.

## Aislamiento y navegacion: prioridades

1. Sustituir la redireccion raiz. El acceso a tienda debe ser mismo origen,
   `/<slug codificado>`, nunca un subdominio productivo.
2. `src/lib/config.ts:7-17` tiene fallback de API productiva en production.
   El modo de marketplace debe exigir configuracion local validada y fallar de
   forma controlada si falta, sin recurrir a produccion.
3. `src/app/[slug]/page.tsx:55` fija metadata al dominio productivo;
   `src/lib/cartLink.ts:108` tiene fallback productivo server-side. Diferenciar
   metadata de trafico de API, pero corregir enlaces del recorrido antes de probar.
4. `src/app/layout.tsx` usa next/font/google y preconnect Cloudinary.
   `next.config.mjs` permite imagenes de cualquier host HTTPS y su CSP es solo
   Report-Only. Revisar recursos externos; una CSP informativa no los bloquea.
5. `next.config.mjs:6` registra PWA fuera de development y cachea paginas,
   imagenes y API store. Usar un perfil dedicado; deshabilitar PWA en modo
   aislado. No borrar datos del navegador usado con el TPV original.
6. `src/lib/customerAuth.ts:4` separa credenciales por tienda en localStorage;
   reactions.ts conserva identificador y reacciones. `cartStore.ts:36` mantiene
   un carrito Zustand global en memoria sin slug. Antes de usar navegacion SPA
   entre tiendas, verificar que no arrastre lineas de otra tienda. Para el primer
   catalogo, enlaces de documento completo a tienda evitan conservar ese singleton;
   no implementar carrito multitienda.

## Propuesta M05/M07

- Portada `/`: encabezado, buscador con etiqueta, filtro de tipo de negocio,
  listado de tiendas y productos en secciones identificables. Conservar busqueda
  y filtros en URL y paginar por seccion. No inventar ubicacion, estrellas,
  descuentos, disponibilidad en vivo o distancias.
- Tarjeta de tienda: nombre, tipo, enlace a tienda; imagen opcional solo tras
  validar politica de recursos. Producto: nombre, tienda, categoria y precio base
  con moneda; no ofrecer compra global ni garantizar precio final/stock.
- Estados diferentes: cargando, sin tiendas publicadas, sin coincidencias y
  error con reintento. No usar mockMenu como fallback de datos reales.
- Tienda y sus errores: enlace visible para regresar al catalogo.
- Campos requeridos y reglas de paginacion: contrato-catalogo.md.

## Propiedad exacta de la siguiente tarea

M05: `src/app/page.tsx`, `src/app/loading.tsx`, `src/app/error.tsx`,
`src/components/MarketplaceCatalog.tsx`, `src/lib/marketplace.ts`, `src/lib/config.ts`,
`src/app/[slug]/page.tsx`, `src/app/[slug]/error.tsx`, `src/app/[slug]/not-found.tsx`,
`src/app/layout.tsx`, `next.config.mjs` y este informe. Todos bajo apps/client,
salvo este informe. Cambios de config limitados al modo aislado y revisados en secuencia.
No editar backend, contrato, otras apps, dependencias, pagos o pedidos.
M07 revisara tambien cartLink.ts y manifiesto; registrar archivos antes de editar.

## Aceptacion observable

- Raiz sin redireccion productiva; enlaces de tienda locales y seguros.
- Busqueda/filtros/pagina consistentes al volver atras; nueva busqueda reinicia pagina.
- Error de API visible como error, no como tienda vacia; reintento conserva filtros.
- Etiquetas, foco visible, navegacion por teclado, zoom y lectura de estados accesibles.
- Datos sinteticos solo en pruebas; ningun negocio presentado como real sin respuesta API.
- Revision estatica ahora. Type-check, navegador movil/escritorio, red y transicion
  entre tiendas pendientes hasta resolver aislamiento e instalar con autorizacion aplicable.
  No se hicieron builds, arranques, instalaciones ni pruebas visuales.
