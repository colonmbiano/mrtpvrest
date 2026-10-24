# M06 Resultado: API pública de catálogo y tiendas

**Fecha:** 22 de octubre de 2026  
**Componente:** Backend MRTPVREST Marketplace  
**Rama:** `feature/marketplace-hibrido`  
**Estado:** Implementado y verificado offline (21/21 pruebas unitarias pasando)

---

## 1. Resumen de Entrega

Se completó la implementación de los endpoints públicos de catálogo y tiendas conforme al contrato M03 y a las aclaraciones de la revisión independiente M04-R/R2 de Claude.

### Archivos Creados y Modificados
- `apps/backend/src/lib/marketplace-catalog.js`: Módulo puro desacoplado, parser de queries estricto, sanitización de búsqueda, adaptador lazy de Prisma y proyecciones públicas seguras.
- `apps/backend/src/routes/marketplace.routes.js`: Router Express para `/api/marketplace/stores` y `/api/marketplace/products`, con control de caché `no-store` y mapeo de errores HTTP (`400 INVALID_QUERY`, `503 CATALOG_UNAVAILABLE`).
- `apps/backend/scripts/marketplace-catalog.test.cjs`: Suite de 21 pruebas unitarias offline con `node:test` y `node:assert/strict`.
- `apps/backend/src/index.js`: Montaje de `/api/marketplace` antes de los middlewares con scope de tenant, respetando `runtime-policy.js`.

---

## 2. Cobertura de Pruebas y Evidencia

Ejecución de la suite:
```bash
node --test apps/backend/scripts/marketplace-catalog.test.cjs
```

Resultado:
- **21 pruebas PASS / 0 FAIL** (duración ~95 ms).
- **parseStoreSlugs**: validación de formato slug, deduplicación, trim y límite de 100 slugs.
- **parseQuery**: valores por defecto (`page: 1, pageSize: 12, q: ''`), rechazo estricto de `q > 80` (400 sin truncar), rechazo de `page` no positiva o decimal, rechazo de `pageSize` fuera de 1..24, validación de `businessType` (RESTAURANT, RETAIL, GROCERY), validación de `store` slug y rechazo de tipos estructurados (arrays, objetos).
- **createCatalog**: carga lazy (con lista vacía jamás instancia el adaptador de BD), filtrado por store slug dentro de la allowlist, proyección estricta que elimina metadatos privados (`tenantId`, `aiApiKey`, recetas, costos, códigos de barras) y retorno `200` con `items: []` cuando `page` supera el total.
- **createPrismaCatalogAdapter**: filtros de tenant (`isActive: true`, `hasWebStore: true`, `isDemo: false`), escape de wildcards `%` y `_` en búsqueda literal, filtro `isAvailable: true` y `availableOnline: true`, verificación cruzada de categoría perteneciente al mismo restaurante y activa.
- **createMarketplaceRouter**: encabezado `Cache-Control: no-store`, respuesta `400 INVALID_QUERY` ante parámetros inválidos y `503 CATALOG_UNAVAILABLE` ante fallos de base de datos/timeout.

Verificación cruzada de sintaxis:
```bash
node apps/backend/scripts/check-syntax.js
```
- **195 archivos JS con sintaxis válida**.

---

## 3. Garantías de Seguridad y Aislamiento

1. **Sin fugas de datos de otros tenants**: Los queries solo consultan los IDs de restaurantes resueltos por la allowlist server-side (`MARKETPLACE_STORE_SLUGS`). No se confía en parámetros enviados por el cliente.
2. **Exclusión de demos e inactivos**: Negocios con `isDemo: true` o `isActive: false` quedan excluidos automáticamente.
3. **Cero exposición de PII / credenciales**: El select y la proyección pública eliminan tokens, recetas, costos y datos internos antes de responder al cliente.
4. **Respeto a modo aislado**: En modo `MARKETPLACE_ISOLATED=true`, bind permanece en `127.0.0.1`, sin jobs ni sockets activos.
