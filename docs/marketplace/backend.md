# M01 y M04: backend del marketplace

Revision local del 22 de octubre de 2026, realizada por el coordinador de este
chat ante cuota agotada del Codex de Orca. No se importo la aplicacion ni se
consultaron servicios. Las referencias a index.js corresponden al cambio M04.

## Superficie existente y datos

- `src/index.js:174-175` monta `/api/public` y `/api/store` antes de
  tenantMiddleware (`:197`). Esto no convierte los datos de todos los tenants en publicos.
- `src/routes/store.routes.js:168` resuelve un restaurante por id o slug y
  rechaza uno inactivo; la sucursal se verifica dentro de ese restaurante.
- `/info` (`:203`) lee configuracion e integraciones, y el flag legacy
  Tenant.hasWebStore (`:218`). Su objeto completo no debe usarse como tarjeta
  de directorio. No exponer tokens, BYOK, contactos privados o configuracion de pagos.
- `/menu` (`:305`) filtra categorias activas y productos por restaurantId,
  isAvailable y availableOnline (o availableOnKiosk). Un directorio nuevo debe
  exigir tambien categoria activa al listar productos; no heredar la opcion kiosk.
- `/locations` (`:483`) pertenece a una tienda. Ninguna de estas rutas proporciona
  hoy el directorio de tiendas requerido por la nueva portada.
- Esquema real: `packages/database/prisma/schema.prisma:298` Restaurant tiene
  slug unico, name, isActive, logoUrl, businessType, tenantId y aiApiKey privado.
  Category (`:593`) y MenuItem (`:619`) tienen restaurantId. MenuItem.availableOnline
  es independiente de isAvailable; price es Float existente, no inventar Decimal.
  RestaurantConfig.currency/currencyLocale (`:1462`) son la moneda y formato.
- Tenant.isDemo (`:38`) y hasWebStore (`:44`) existen. TenantModule (`:92`) es
  el modelo canonico de modulos, con dual-write legacy documentado. No asumir que
  hasWebStore equivale a consentimiento de aparecer en un marketplace.
- `packages/database/tenant-guard.js:36` incluye Category, MenuItem, Location y
  RestaurantConfig. Mantener filtros explicitos y guard; no desactivarlo para
  facilitar consultas entre tiendas. Proyecciones publicas deben ser permitidas
  campo por campo y nunca serializar modelos completos.

## M04 implementado

`src/lib/runtime-policy.js` contiene una politica pura, cargada en `src/index.js:3`
antes de las dependencias de la aplicacion:

| Ajuste | Comportamiento |
| --- | --- |
| MARKETPLACE_ISOLATED=true | Bind fijo 127.0.0.1; jobs desactivados; conexiones Socket.io rechazadas |
| MARKETPLACE_ALLOWED_ORIGINS | Lista separada por comas de origenes HTTP(S) loopback exactos; predeterminado http://127.0.0.1:4103 |
| ENABLE_BACKGROUND_JOBS=false | No importa ni registra los siete jobs; fuera de aislamiento mantiene la revalidacion de sockets |
| MARKETPLACE_ISOLATED=true + ENABLE_BACKGROUND_JOBS=true | Error temprano; no admite activar jobs por accidente |
| HOST | Configurable fuera del modo aislado; el modo aislado siempre impone 127.0.0.1 |

Los booleanos mal escritos y origenes externos, comodines o URLs con rutas,
credenciales, fragmentos o query producen error. CORS conserva 403/CORS_BLOCKED/WARN.
Peticiones sin Origin siguen permitidas: CORS no reemplaza autenticacion.
El modo normal conserva los defaults anteriores, incluidos jobs y CORS existentes.
La politica se captura al iniciar; cambiar variables exige reinicio.

Los sockets se rechazan en el modo aislado para evitar dejar conexiones
autenticadas sin revalidacion periodica. Fuera de ese modo, apagar jobs de negocio
no desactiva esa proteccion. Los siete jobs se cargan solamente cuando estan habilitados.

## Evidencia y limites

- `node --test apps/backend/scripts/runtime-policy.test.cjs`: 9 pruebas pasan.
  Cubren ausencia de carga de jobs, sweep, origenes ajenos y puertos incorrectos,
  configuracion invalida, conservacion de protecciones de sockets y siete jobs normales.
  Solo Node y modulos puros; ningun listener, BD ni dependencia del proyecto.
- Ejecutar el comprobador de sintaxis existente para validar el cableado sintactico.
  La integracion Express/Socket.io real sigue pendiente; no se declara probada.
- No se editaron entornos ni se activo/arranco el modo. Antes de cualquier arranque
  debe configurarse explicitamente MARKETPLACE_ISOLATED=true en el entorno dedicado.
- Esto no es un cortafuegos de salida: rutas y dependencias todavia pueden abrir
  conexiones al ser importadas o llamadas; Sentry sigue inicializandose en index.js:23.
- Permanecen el CMD con migraciones de `apps/backend/Dockerfile:29`, integraciones
  opcionales, URLs del resto de apps, credenciales almacenadas en BD y CI remoto.
  No arrancar hasta cerrar los pendientes de MARKETPLACE-STAGING.md.
- El verificador de preparacion original exige codigo versionado intacto: ahora
  debe distinguir su fallo esperado de integridad de un fallo de aislamiento.
  No modificarlo ni actualizar sus hashes para ocultar estas diferencias.

## Siguiente propiedad de archivos

M06: `apps/backend/src/lib/marketplace-catalog.js`,
`apps/backend/src/routes/marketplace.routes.js`,
`apps/backend/scripts/marketplace-catalog.test.cjs` y montaje serializado en index.js.
Contrato en `docs/marketplace/contrato-catalogo.md`; sin cambios de esquema ni migraciones.
Codex de Orca revisara M04 al recuperar cuota antes de asumir nueva implementacion.
