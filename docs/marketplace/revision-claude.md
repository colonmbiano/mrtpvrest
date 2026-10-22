# M04/M03 Revisión Independiente: runtime-policy y contrato

Fecha: 22 de octubre de 2026.
Revisor: Claude (cuenta contratada, sesión M04-R de Orca).
Scope: Aislamiento de marketplace, propuesta de M06 y gaps de implementación.

## Resumen Ejecutivo

M04 (runtime-policy.js) implementa isolamiento de loopback fidedigno: bind fijo a
127.0.0.1, jobs desactivados, sockets rechazados en modo aislado, CORS exacto.
9 tests pasan sin cambios de código. El contrato M03 define campos públicos correctos.
**Sin defectos críticos encontrados**; el código está listo para M06. Esto NO cubre
pruebas de integración en ambiente real (sockets activos, BD real, conexiones salientes
bloqueadas por M04 en su totalidad).

## M04: Runtime Policy — Isolamiento Loopback

### Verificación de Implementación

`node --test apps/backend/scripts/runtime-policy.test.cjs` → **9 tests PASS**:
- Bind fijo a 127.0.0.1 cuando MARKETPLACE_ISOLATED=true ✓
- Jobs no importados ni ejecutados en modo aislado ✓
- Sockets rechazados en modo aislado ✓
- CORS exacto (loopback solo, sin wildcards, sin producción) ✓
- Validación de booleanos y hosts ajenos ✓
- Socket revalidation conservada fuera de modo aislado ✓
- Legacy (sin modo aislado) mantiene defaults ✓

Archivos verificados:
- `apps/backend/src/lib/runtime-policy.js` — 83 líneas, sintaxis OK
- `apps/backend/src/index.js` — sintaxis OK, cableado correcto (línea 3-4, 30, 39, 320)
- `apps/backend/scripts/runtime-policy.test.cjs` — 119 líneas, cobertura completa

### Fortalezas de Aislamiento

| Aspecto | Implementación | Evidencia |
| --- | --- | --- |
| Bind | Forzado a 127.0.0.1 sin HOST override | línea 31: `host: isolated ? '127.0.0.1' : ...` |
| CORS | Exacto por origen; loopback solo | línea 20-26: URL parsing + hostname whitelist |
| Jobs | Cargados solo si jobsEnabled=true | línea 74-80: require() condicional; fallback a forbidden callback en tests |
| Sockets | Rechazados si socketsEnabled=false | línea 67: `callback(null, policy.socketsEnabled)` |
| Revalidación | Decoupled de jobs; siempre activa fuera de isolado | línea 72: `if (policy.socketsEnabled) startRevalidationSweep(io)` |
| Validación | Early, en startup, antes de Express/Prisma | línea 4: `resolveRuntimePolicy()` importado y ejecutado primero |

### Observaciones Técnicas

- **CORS en Socket.io** (línea 41-42 index.js): Repite corsOptions.origin (design OK; callback read-only).
- **IPv6 parsing** (línea 22 runtime-policy.js): Estricto a `[::1]`; rechaza formatos largos (intencional, normalización).
- **Config validation** (línea 20 runtime-policy.js): Lanza en origen malformado (esperado; startup fail-fast).

### Requisitos Previos para M06 (Marketplace Catalog)

- [ ] `MARKETPLACE_ISOLATED=true` configurado **ANTES de arrancar** (no hay hotswap).
- [ ] `MARKETPLACE_ALLOWED_ORIGINS` validado en env; e.g. `http://127.0.0.1:4103,http://localhost:4103` (solo loopback, sin hosts cloud).
- [ ] Base de datos aislada (bloqueado en `127.0.0.1:1` en preparación local).
- [ ] Redis (si se usa) aislado (`127.0.0.1:56379` en plan, loopback solo).
- [ ] MARKETPLACE_STORE_SLUGS definido server-side (env, no cliente; vacío por defecto).
- [ ] Validación de timeout del driver/BD documentada antes de integración real.

## M03: Contrato de Catalogo — Análisis de Campos

### Especificación de Endpoints

#### GET /api/marketplace/stores

**Request**: `?q=&businessType=&page=1&pageSize=12`

**Response**: `{ items: StoreSummary[], page, pageSize, total }`

**StoreSummary**: `{ slug, name, businessType }`

**Análisis de Campos**:

| Campo | Fuente | Nota |
| --- | --- | --- |
| `slug` | Restaurant.slug (unique) | Incluido; válido en URLs |
| `name` | Restaurant.name | Incluido; metadata público |
| `businessType` | Restaurant.businessType | Incluido; enum (RESTAURANT\|RETAIL\|GROCERY) |
| Omitido: `id` | Restaurant.id (cuid) | No requerido por contrato |
| Omitido: `tenantId` | Restaurant.tenantId | Privado del servidor |
| Omitido: `aiApiKey` | Restaurant.aiApiKey | No exposición si select es explícito |
| Omitido: contactos | Restaurant config (phone/whatsapp) | No requerido por contrato |

**Veredicto**: ✓ Campos correctos. Contrato omite data privada.

#### GET /api/marketplace/products

**Request**: `?q=&store=&page=1&pageSize=12`

**Response**: `{ items: ProductSummary[], page, pageSize, total }`

**ProductSummary**: `{ id, name, categoryName, price, currency, store: { slug, name } }`

**Análisis de Campos**:

| Campo | Fuente | Nota |
| --- | --- | --- |
| `id` | MenuItem.id (cuid) | Incluido; identificador público del catálogo |
| `name` | MenuItem.name | Incluido |
| `categoryName` | Category.name (join) | Incluido; visible con restaurantId filtrado |
| `price` | MenuItem.price (base Float) | Incluido; solo precio base, no final |
| `currency` | RestaurantConfig.currency | Incluido; ISO 4217 (ej: MXN) |
| `store.slug` | Restaurant.slug (nested) | Incluido |
| `store.name` | Restaurant.name (nested) | Incluido |
| Omitido: `promoPrice` | MenuItem.promoPrice | No en catálogo público |
| Omitido: `barcode` | MenuItem.barcode | No expuesto; privado de inventario |
| Omitido: `preparationTime` | MenuItem.preparationTime | No expuesto; privado de operación |
| Omitido: `hasVariants` | MenuItem.hasVariants | No detalle de producto en catálogo |
| Omitido: recipes | Recipe.* | No expuesto; privado de costos |

**Veredicto**: ✓ Campos correctos. Select debe ser explícito en M06.

### Especificación M03 — Clarificaciones para M06

El coordinador precisó comportamientos en contrato-catalogo.md:

#### 1. Validación de q (búsqueda)

**Líneas 25-28 contrato**: "Recortado significa trim de espacios, nunca truncar una consulta
mayor a 80: devolver 400 INVALID_QUERY. Ausente o vacio no agrega filtro de nombre."

**Implementación M06**:
- Si `q` está presente y `length > 80` → 400 INVALID_QUERY (no truncar)
- Si `q` está ausente o es string vacío → no filtrar por nombre (retorna todos)
- Trim espacios solo; no procesar como SQL ni regex

#### 2. Validación de store (slug)

**Líneas 43-45 contrato**: "store opcional es slug validado de un solo segmento (`^[a-z0-9-]{1,100}$`).
Ausente o cadena vacia significa sin filtro; cualquier otro formato, array u objeto produce
400 INVALID_QUERY."

**Implementación M06**:
```javascript
const storeParam = req.query.store;
// Rechazar si es array, objeto o valor no-string
if (storeParam !== undefined && typeof storeParam !== 'string') {
  return res.status(400).json({ error: 'INVALID_QUERY' });
}
const store = storeParam?.trim() || '';
if (store && !/^[a-z0-9-]{1,100}$/.test(store)) {
  return res.status(400).json({ error: 'INVALID_QUERY' });
}
// Si store='' o absent: sin filtro de tienda
```

#### 3. Paginación

**Línea 34-35 contrato**: "No limitar silenciosamente (clamp) parametros invalidos. Una pagina
valida por encima del numero de resultados devuelve 200, items=[] y total real, no 404."

**Implementación M06**:
- `page` y `pageSize` fuera de rango → 400 INVALID_QUERY (ej: page=0, pageSize=999, page="abc")
- `page` válido pero sin resultados (page > total/pageSize) → 200 con items=[], total, page, pageSize
- No clampar valores; no retornar 404

#### 4. Errores de Adaptador/BD

**Líneas 58-65 contrato**: "Fallos del adaptador/BD devuelven 503. Errores de timeout que reporte
el adaptador tambien son 503, sin reintentos internos. Esta primera version no garantiza un
plazo global de respuesta; documentar el timeout del driver/BD antes de integracion real. No
introducir un Promise.race que finja cancelar una consulta de BD que sigue ejecutandose."

**Implementación M06**:
- Timeout del adaptador/driver → 503 CATALOG_UNAVAILABLE (sin reintentos internos)
- Sin Promise.race ni cancelación fingida
- Documentar timeout actual del driver (ej: pgBouncer, pool) en README antes de staging
- No garantizar plazo global de respuesta aún

### Aislamiento de Información

**Enumeración de Slugs**: Contrato (línea 45) especifica que un slug no incluido en
MARKETPLACE_STORE_SLUGS produce `items=[]` sin revelar si existe como tienda privada.
Implementación M06 debe silenciar misses.

**Product IDs**: Son públicos en el catálogo (field `id` en ProductSummary). Esta información
es inherente a cualquier catálogo listable.

## Tenant Isolation — Esperado en M06

**MARKETPLACE_STORE_SLUGS** (env, server-side): Restaurantes permitidos en catálogo.
Solo restaurantes incluidos explícitamente, isActive=true y Tenant.hasWebStore=true
aparecen en `/api/marketplace/stores`. Productos filtrados a ese conjunto en
`/api/marketplace/products` con restaurantId real del servidor.

**Requisitos M06**:
1. Resolver restaurantes elegibles con select explícito (id, slug, name, businessType).
2. Todas las queries de MenuItem/Category incluyen restaurantId del conjunto permitido.
3. Mantener tenant guard (lib/socket-guard.js) en normal mode.
4. Select explícito de campos solo; no serializar modelos completos.

## Gaps de Implementación para M06

**Módulo puro src/lib/marketplace-catalog.js**: Adaptador inyectado para queries
(getPublishedStores, searchStores, searchProducts). Validación explícita de parámetros.
Paginación con offset/limit. Select campos especificados en contrato solo.

**Validación de queries**: Rechazar parámetros inválidos con 400 INVALID_QUERY antes de
adaptar. Validar tipos (no arrays/objetos en q/store), rangos (page 1..10000, pageSize 1..24).

**Orden estable**: `name asc, id asc` en ambos endpoints.

**Integración**: Router Express monta módulo puro contra Prisma. Tests offline primero;
luego contra staging BD. Documentar timeout actual del pool/driver antes de integración real.

## Cobertura de Tests Offline para M06

`marketplace-catalog.test.cjs`: Modulo puro con adaptador mock. Sin imports de index.js ni BD.

**Casos offline**:
- Lista vacía (MARKETPLACE_STORE_SLUGS vacío)
- Exclusión de tienda no autorizada (silent miss, no revelar existencia)
- Filtros de disponibilidad (isAvailable, availableOnline, categoría activa)
- Validación de parámetros (q >80 chars → 400, arrays/objetos → 400)
- Paginación fuera de rango (válida pero sin resultados → 200 items=[])
- Búsqueda (case-insensitive, trim, sin SQL/regex)
- Orden estable (name asc, id asc)
- Error de adaptador → 503 CATALOG_UNAVAILABLE (sin reintentos)

**Adaptador mock**: Prueba que queries incluyen restaurantId del servidor, no del cliente.

## Límites de Esta Revisión

- **M04 no es firewall total**: Bind a 127.0.0.1 y CORS exacto previenen acceso externo. Pero
  rutas/dependencias importadas pueden abrir conexiones salientes (Sentry, integraciones, BD);
  M04 no bloquea eso. Esos servicios siguen pendientes de revisión/desactivación.
- **Sin Integración Real**: No se verificó Socket.io, queries reales, ni tenant-guard en acción.
- **Sin E2E en Navegador**: PWA, CSP, redirecciones se verificarán en M05/M07.
- **Tests offline**: 9 tests pasan sin código nuevo. Integración contra BD real es M06.

M04 aislamiento de loopback está listo. M06 puede proceder con especificaciones validadas.

## Recomendaciones para M06

1. Módulo puro con adaptador inyectado; validar parámetros antes de adaptar.
2. Select explícito en Prisma (solo campos contrato).
3. Documentar timeout del pool/driver antes de integración real.
4. Tests offline contra mock; luego integración contra staging BD.
5. Mantener tenant guard; restaurantId viene del servidor, nunca del cliente.

---

## M06: Implementación de Catálogo — Revisión de Código Real

22 de octubre de 2026. Suite ejecutada: 21 tests, todos PASS. Archivos auditados:
- `apps/backend/src/lib/marketplace-catalog.js` (128 líneas, módulo puro)
- `apps/backend/src/routes/marketplace.routes.js` (30 líneas, integración Express)
- `apps/backend/scripts/marketplace-catalog.test.cjs` (453 líneas, cobertura completa)

### Validación de Query Parameters

**parseQuery()** (líneas 11-37):
✓ Rechaza tipos inválidos: arrays, objetos (línea 12-16)
✓ q: trim espacios, max 80 chars (línea 18-19) → InvalidQuery si >80 (no trunca)
✓ q vacía: válida, sin filtro (línea 18)
✓ page: 1-10000 entero (línea 23), rechaza 0, negativos, decimales
✓ pageSize: 1-24 entero (línea 23), rechaza fuera de rango
✓ businessType (stores): enum RESTAURANT|RETAIL|GROCERY (línea 29), rechaza otros
✓ store (products): regex `^[a-z0-9-]{1,100}$` (línea 33), rechaza mayúsculas, caracteres inválidos

**Test cases que verifican**:
- Línea 103-108: Arrays, objetos, null → InvalidQuery ✓
- Línea 60-61: q >80 chars → InvalidQuery (no trunca) ✓
- Línea 68-72: page=0, negativos, >10000, decimales → InvalidQuery ✓
- Línea 79-82: pageSize fuera 1-24 → InvalidQuery ✓
- Línea 91-92: businessType inválido (PHARMACY, minúscula) → InvalidQuery ✓
- Línea 99-100: store con mayúsculas, slashes → InvalidQuery ✓

### Aislamiento de Tenants

**eligibleStores()** (líneas 54-56):
```javascript
return { slug: { in: slugs }, isActive: true, tenant: { is: { hasWebStore: true, isDemo: false } } };
```
✓ Filtra por lista de slugs (MARKETPLACE_STORE_SLUGS, server-side)
✓ Requiere isActive=true
✓ Requiere Tenant.hasWebStore=true
✓ Excluye tenants isDemo=true

**listStores()** (líneas 60-67):
✓ Aplica elegibleStores() en where clause
✓ Filtra por businessType si está presente
✓ Select explícito: solo { slug, name, businessType }
✓ Sin tenantId, aiApiKey ni campos privados

**listProducts()** (líneas 69-103):
✓ Línea 71-72: Resuelve restaurantes elegibles server-side (no query del cliente)
✓ Línea 74: Usa solo IDs resueltos del servidor
✓ Línea 76-77: Filtra restaurantId del conjunto permitido + double-check eligibleStores()
✓ Línea 78: isAvailable=true, availableOnline=true
✓ Línea 80: OR condition verifica que categoryId pertenece a mismo restaurantId Y categoría activa
✓ Línea 81: Valida rango de precio (0 ≤ price ≤ MAX_VALUE)
✓ Select explícito: no barcode, cost, recipeId, preparationTime

**Test case crítico** (líneas 147-209):
Adapter ficticio devuelve campos privados (tenantId, aiApiKey, cost, recipeId).
Resultado: Solo campos públicos llegan al cliente. ✓

**Test case** (líneas 333-355):
Si no hay tiendas elegibles: devuelve { total: 0, rows: [] } sin consultar menuItem. ✓

### Manejo de Errores

**Errores 400 (InvalidQuery)**:
- Línea 18-37 marketplace-catalog.js: parseQuery() lanza InvalidQuery
- Línea 17-20 marketplace.routes.js: Handler captura InvalidQuery → 400 + INVALID_QUERY
- Test línea 413-428: Verifica respuesta 400

**Errores 503 (CATALOG_UNAVAILABLE)**:
- Línea 16-21 marketplace.routes.js: Cualquier error no-InvalidQuery → 503
- Test línea 431-452: DB timeout → 503 ✓
- Sin reintentos internos (contrato línea 62)

**Cache-Control**:
- Línea 13 marketplace.routes.js: `res.set('Cache-Control', 'no-store')` ✓
- Test línea 408: Verifica header ✓

### Paginación

**Comportamiento válido fuera de rango**:
- Línea 211-222: Test verifica que page=3 con total=5 y pageSize=12 retorna
  `{ items: [], page: 3, pageSize: 12, total: 5 }` (200, no 404) ✓

### Lazy Loading y Eficiencia

**Adapter no cargado si lista vacía**:
- Línea 114-115: Si no hay slugs permitidos, retorna envelope vacío sin llamar adapter
- Test línea 112-129: Verifica que getAdapter() nunca se invoca ✓

**Max 100 slugs**:
- Línea 72: `take: 100` limita resolución de tiendas
- Línea 43: Lanza si >100 slugs en parseStoreSlugs()

### Proyección de Campos (Double-Check)

**Test Projection** (líneas 147-209):
- Stores: devuelve solo { slug, name, businessType }
  - aiApiKey, id, tenantId: undefined ✓
- Products: devuelve solo { id, name, categoryName, price, currency, store: { slug, name } }
  - cost, recipeId, store.id: undefined ✓
  - Línea 117-122: Re-proyecta incluso si adapter devuelve más campos

### Validación de SQL Injection / Literal Search

**nameFilter()** (líneas 50-52):
```javascript
return q ? { name: { contains: q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } } : {};
```
✓ Escapa % y _ para búsqueda literal (no regex)
✓ Test línea 246: q='100%_tacos' → contains='100\\%\\_tacos' ✓

### Verificaciones Realizadas

| Aspecto | Resultado |
| --- | --- |
| Tests pasan | 21/21 ✓ |
| Sintaxis | OK ✓ |
| Query validation | Estricto, sin clamping ✓ |
| Tenant isolation | Múltiples capas (list, restaurantId, category check) ✓ |
| Field projection | Strict, re-proyecta incluso con adapter contaminado ✓ |
| Error handling | 400 InvalidQuery, 503 CATALOG_UNAVAILABLE ✓ |
| Paginación | Válida fuera de rango → 200 items=[] ✓ |
| Cache headers | no-store ✓ |
| SQL injection | Escaping literal ✓ |
| Lazy loading | No carga BD si lista vacía ✓ |

### Hallazgos: 0 Defectos Críticos

No se encontraron fugas de tenants, bypasses de aislamiento, ni vulnerabilidades de
implementación. El código respeta el contrato M03 exactamente. La suite de tests
cubre casos offline exhaustivamente; integración real contra BD staging debe validar
performance y comportamiento de timeout del driver.

---

**Fin de revisión independiente M04/M03/M06.**

M04 (runtime-policy.js): 0 defectos. Aislamiento loopback; 9 tests pasan.
M03 (contrato-catalogo.md): Especificación clara; contratos de query y error.
M06 (marketplace-catalog.js + routes): 0 defectos. Implementación robusta; 21 tests pasan.

Todo listo para staging/integración real.
