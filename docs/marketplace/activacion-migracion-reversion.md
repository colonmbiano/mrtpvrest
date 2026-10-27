# Marketplace: activación, migración y reversión (C7)

Corte: 27/oct/2026. Rama `feature/marketplace-hibrido` (PR #162) contra `master` en `2bbb50ef` (ya incluye el PR #160).
Este documento es el plan para llevar el PR #162 a producción y encender el marketplace por etapas. **No ejecuta nada**: cada paso con efectos (merge, migración, variables, OTA) requiere una instrucción explícita del usuario.

Separación de evidencia, como en el resto de `docs/marketplace/`:

- **Probado en local y en bases desechables:** todo lo que dice "verificado" abajo.
- **No verificado:** el estado real de la base de producción (la lectura fue rechazada por permisos), el comando con el que arranca el servicio de Railway (sesión de la CLI vencida) y la política de respaldos de Supabase.

## 1. Qué pasa al fusionar el PR #162 (todas las banderas apagadas)

Un push a `master` dispara, sin intervención:

| Destino | Qué sucede | Fuente |
| --- | --- | --- |
| Railway `mrtpvrest / production` (backend `api.mrtpvrest.com`) | Despliega el backend. El `CMD` del `Dockerfile` ejecuta `prisma migrate deploy` antes de arrancar (salvo `MARKETPLACE_ISOLATED=true`); si una migración falla, el contenedor no arranca | `apps/backend/Dockerfile`. Que Railway use ese `CMD` y no el `startCommand` de `apps/backend/railway.json` es **probable, no verificado** (el despliegue del #160 terminó bien el 27/oct 04:46Z) |
| Vercel (producción) | Publica las apps con cambios. El proyecto raíz `mrtpvrest` falla desde el 30/sep (Delivery sin `NEXT_PUBLIC_API_URL`) y no reemplaza lo publicado | Estados de despliegue en GitHub |
| OTA (canal `production`) | `tpv-ota-release`, `delivery-ota-release`, `meseros-lite-ota-release` y `moda-ota-release` publican solos si cambian sus rutas; el #162 toca las cuatro. Los equipos la instalan al pasar a segundo plano o reiniciar (`directUpdate: false`) | `.github/workflows/*-ota-release.yml`, `apps/tpv/capacitor.config.*` |
| GitHub Actions | CI de cada app y APK de depuración (solo artefactos, sin releases) | `.github/workflows/` |

**Visible para todos aunque las banderas estén apagadas:** tema negro con naranja del TPV; paneles de pedidos del marketplace en TPV y KDS (vacíos mientras no haya pedidos v1); bloqueo de "Cobrar" y de edición en pedidos del marketplace; el mesero en una comandera entra directo al salón; filtros de pago en "Cobradas"; hub del repartidor rediseñado y GPS activo en todas sus pantallas; coordenadas opcionales de sucursal en el admin; panel de marketplace del SaaS con el resumen real.

**No se activa sin banderas:** pedidos v1, entrega v1, pago en línea, red compartida, Ops de la red, finanzas e identidad global.

## 2. Migraciones nuevas frente a master (9, en este orden)

Todas usan `IF NOT EXISTS` o bloques `DO … IF NOT EXISTS`: una segunda corrida no hace nada. Verificado en PostgreSQL desechable: las 101 migraciones aplican desde cero, una segunda corrida es no-op y no queda desfase nuevo frente a `schema.prisma` (persiste el desfase previo de master: `retail_sales_priceListId_idx`, `Ingredient.imageUrl` y `DEFAULT` de `updatedAt` en tablas de nómina/retail).

| Migración | Qué hace | Riesgo en producción | ¿Reversible? |
| --- | --- | --- | --- |
| `20261023000000_marketplace_identity` | 4 tablas de identidad global (cuentas, sesiones) | Ninguno sobre datos existentes | Las tablas quedan inertes si se revierte el código |
| `20261023190000_marketplace_order_states` | Agrega `PENDING_PAYMENT` y `PENDING_MERCHANT` al enum `OrderStatus` | Bajo | **No**: PostgreSQL no quita valores de un enum. Ver 5.3 |
| `20261023210000_reconcile_marketplace_branch_drift` | Crea (si faltan) 7 tablas que entraron al schema sin migración, 3 columnas con valor por defecto en `locations`, índices únicos `(id, restaurantId)` en `orders`, `locations` y `menu_items`, y 10 llaves foráneas | **Medio.** Los índices únicos bloquean escrituras en esas tablas mientras se construyen: ventana de poco tráfico. Si producción ya tiene esas tablas (por `db push`) con filas huérfanas, la llave foránea falla, la migración falla y el backend no arranca. Ver la sección 3 | Aditiva |
| `20261024100000_marketplace_merchant_memberships` | Aprobación de comercios para el directorio | Ninguno | Inerte |
| `20261024120000_marketplace_quotes` | Cotizaciones v1 | Ninguno | Inerte |
| `20261024140000_marketplace_webhook_events` | Eventos de webhook idempotentes | Ninguno | Inerte |
| `20261024160000_marketplace_buyer_addresses` | Libreta de direcciones del comprador | Ninguno | Inerte |
| `20261025100000_marketplace_network_persistence` | 10 tablas de red, Ops y finanzas; `locations.latitude/longitude` (opcionales) y una restricción que exige ambas o ninguna, en rango | Bajo. La restricción valida filas existentes, que no tienen esas columnas: pasa | Aditiva |
| `20261027000000_driver_location_order_index` | Índice `DriverLocation(driverId, orderId, createdAt)` para el seguimiento | Bajo. Bloquea escrituras de GPS mientras se construye; depende del tamaño de la tabla | Aditiva |

Llaves foráneas que la reconciliación valida contra filas existentes:

| Tabla hija | Columnas | Referencia |
| --- | --- | --- |
| `delivery_incidents` | `orderId, restaurantId` | `orders (id, restaurantId)` |
| `delivery_evidence` | `orderId, restaurantId` | `orders (id, restaurantId)` |
| `marketplace_payments` | `orderId, restaurantId` | `orders (id, restaurantId)` |
| `marketplace_ledger_entries` | `paymentId, restaurantId, orderId` | `marketplace_payments (id, restaurantId, orderId)` |
| `marketplace_ledger_entries` | `payoutId, restaurantId` | `marketplace_driver_payouts (id, restaurantId)` |
| `marketplace_driver_payouts` | `restaurantId` / `driverId` | `restaurants (id)` / `Employee (id)` |
| `location_menu_item_promos` | `locationId, restaurantId` / `menuItemId, restaurantId` | `locations` / `menu_items (id, restaurantId)` |
| `marketplace_order_pipelines` | `orderId, restaurantId` | `orders (id, restaurantId)` |

## 3. Verificaciones previas en producción (solo lectura)

Correr en la base de producción (Supabase `Mrtpvrest`) **antes** del merge. Son solo `SELECT`.

```sql
-- 3.1 Historial de migraciones sano: debe devolver 0 filas.
SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;

-- 3.2 Última migración aplicada: debe ser 20261017220000_add_kitchen_note_flags (la del #160).
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name DESC LIMIT 3;

-- 3.3 ¿Ya existen las tablas que crea la reconciliación? (NULL = no existe; la migración la crea vacía.)
SELECT t, to_regclass('public.' || t) AS existe FROM unnest(ARRAY['delivery_incidents','delivery_evidence',
  'marketplace_payments','marketplace_ledger_entries','marketplace_driver_payouts','location_menu_item_promos',
  'marketplace_order_pipelines']) AS t;

-- 3.4 Solo para las tablas que SÍ existen: filas que romperían su llave foránea. Todas deben dar 0.
SELECT count(*) FROM delivery_incidents x LEFT JOIN orders o ON o.id = x."orderId" AND o."restaurantId" = x."restaurantId" WHERE o.id IS NULL;
SELECT count(*) FROM delivery_evidence x LEFT JOIN orders o ON o.id = x."orderId" AND o."restaurantId" = x."restaurantId" WHERE o.id IS NULL;
SELECT count(*) FROM marketplace_payments x LEFT JOIN orders o ON o.id = x."orderId" AND o."restaurantId" = x."restaurantId" WHERE o.id IS NULL;
SELECT count(*) FROM marketplace_order_pipelines x LEFT JOIN orders o ON o.id = x."orderId" AND o."restaurantId" = x."restaurantId" WHERE o.id IS NULL;
SELECT count(*) FROM location_menu_item_promos x LEFT JOIN locations l ON l.id = x."locationId" AND l."restaurantId" = x."restaurantId" WHERE l.id IS NULL;
SELECT count(*) FROM location_menu_item_promos x LEFT JOIN menu_items m ON m.id = x."menuItemId" AND m."restaurantId" = x."restaurantId" WHERE m.id IS NULL;
SELECT count(*) FROM marketplace_driver_payouts x LEFT JOIN "Employee" e ON e.id = x."driverId" WHERE e.id IS NULL;

-- 3.5 Tamaño de las tablas que reciben índices nuevos (estimar el bloqueo).
SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE relname IN ('orders','locations','menu_items','DriverLocation');

-- 3.6 Valores actuales del enum (los dos nuevos aún no deben estar).
SELECT unnest(enum_range(NULL::"OrderStatus"));
```

Si 3.1 o 3.4 no dan 0, **no fusionar**: corregir primero los datos o la migración.

## 4. Orden de salida

### Fase 0: preparación (antes del merge)

1. **Respaldo** de la base de producción, por ejemplo un respaldo manual en Supabase o un `pg_dump` lógico, y anotar la hora. Confirmar qué respaldos automáticos y PITR tiene el plan.
2. **Railway:** con `railway login`, confirmar en el servicio de producción que el arranque usa el `CMD` del `Dockerfile` (migraciones automáticas). Si usa otro comando, las migraciones hay que aplicarlas a mano con `prisma migrate deploy` antes de que arranque el código nuevo.
3. **Verificaciones de la sección 3** en verde.
4. **Actualizaciones a los equipos (OTA).** Elegir una:
   - **A.** Dejar que salgan solas al fusionar. Los equipos las instalan al pasar a segundo plano.
   - **B.** Desactivar en GitHub los cuatro workflows `*-ota-release` antes del merge y publicarlos después con `workflow_dispatch`: primero canal `beta`, luego `production`.
5. **Ventana de poco tráfico** para el merge, por el bloqueo de los índices únicos.
6. **Variables:** ninguna bandera nueva hace falta para este paso. Confirmar que no exista `MARKETPLACE_ISOLATED=true` en producción, porque desactiva trabajos de fondo y sockets.

### Fase 1: merge con banderas apagadas

1. Fusionar el PR #162 en `master`.
2. Verificar:
   - Despliegue de Railway en `success` y `GET /health` en 200.
   - `_prisma_migrations` con 101 filas terminadas y ninguna fallida.
   - Logs del backend sin errores nuevos.
   - Vercel publicado para TPV, admin, SaaS, tienda y repartidor.
   - Versión OTA publicada.
3. Prueba de humo en un comercio real: vender y cobrar en el TPV, cocina en KDS, mesero en comandera, repartidor tomando un pedido propio y la tienda en línea de siempre.

### Fase 2: piloto de pedidos v1 para recoger (un comercio)

Backend (Railway):

| Variable | Valor | Para qué |
| --- | --- | --- |
| `MARKETPLACE_V1_ORDERS_ENABLED` | `true` | Cotización, orden y seguimiento v1 |
| `MARKETPLACE_COMMISSION_BPS` | Decisión del usuario (puntos base; 1500 = 15%) | Comisión de la plataforma |
| `MARKETPLACE_PIN_SECRET` / `MARKETPLACE_PIN_KEY_ID` | Secreto nuevo y propio / `v1` | Sin el secreto, crear una orden responde 503 |
| `MARKETPLACE_DIRECTORY_APPROVED` | `true` | El directorio incluye comercios aprobados |
| `MARKETPLACE_STORE_SLUGS` | Opcional | Lista fija de comercios, sin pasar por aprobación |

Comercio piloto: módulo `marketplace` activo (en el tenant o por su plan) y aprobación en el SaaS (`POST /api/saas/marketplace/memberships/:restaurantId/review`). Los tenants demo nunca entran.

Tienda: el checkout usa v1 cuando el backend v1 del comercio responde. Si responde 503, se queda el checkout normal. Para el catálogo multitienda en la raíz: `NEXT_PUBLIC_MARKETPLACE_CATALOG=true` y `NEXT_PUBLIC_MARKETPLACE_STORES_V1=true`. Requieren rebuild en Vercel.

Verificar: pedido → "por aceptar" en TPV y KDS → aceptar → preparar → listo → entregar con el PIN de recogida, y el seguimiento del comprador.

### Fase 3: domicilio con repartidores propios

- `MARKETPLACE_V1_DELIVERY_ENABLED=true`.
- Regla de envío del comercio configurada.
- Coordenadas de la sucursal en el admin, para que el comprador vea el punto de salida.
- Repartidores con la app actualizada y permiso de ubicación.

Verificar: asignar repartidor → en camino → mapa del seguimiento con el repartidor → entregar con el PIN de entrega.

### Fase 4: pago en línea

Requiere C6, la prueba real en sandbox de Mercado Pago:
- `MARKETPLACE_V1_ONLINE_PAYMENTS_ENABLED=true`.
- `MARKETPLACE_MP_NOTIFICATION_URL` con la URL HTTPS pública del webhook v1.
- `MARKETPLACE_MP_WEBHOOK_SECRET`.
- `MARKETPLACE_PAYMENT_NETWORK_ENABLED=true` para permitir las llamadas a Mercado Pago.
- Credenciales del comercio o de la plataforma, según el flujo elegido.

### Fase 5: red compartida, finanzas e identidad (todavía no para producción)

- `MARKETPLACE_NETWORK_ENABLED` y `NEXT_PUBLIC_MARKETPLACE_NETWORK_ENABLED` conectan el despacho persistente.
- `MARKETPLACE_FINANCE_ENABLED` conecta liquidaciones y reembolsos. Falta el publicador del outbox.
- `MARKETPLACE_IDENTITY_ENABLED` hoy exige `MARKETPLACE_IDENTITY_MODE=staging` y un origen HTTPS: el código no la permite en producción.

Antes de esta fase:
- Cerrar los hallazgos del [informe G8](auditoria-seguridad-codex-2026-10-26.md): dependencias, claves JWT separadas y contador del PIN propio compartido.
- Decidir qué comercios y con qué política.
- Probar en staging con navegador.

## 5. Reversión

### 5.1 Por bandera (lo normal)

Apagar la variable en Railway, que redespliega solo, o en Vercel con un rebuild:

- `MARKETPLACE_V1_ORDERS_ENABLED=false`: la tienda vuelve al checkout normal. Los pedidos v1 ya creados siguen en el TPV y se terminan ahí, pero su seguimiento responde 503.
- `MARKETPLACE_V1_DELIVERY_ENABLED=false`: no se cotiza domicilio v1. Lo ya asignado se entrega desde la app del repartidor.
- `MARKETPLACE_V1_ONLINE_PAYMENTS_ENABLED=false`: solo efectivo. Un pago ya iniciado puede seguir llegando por webhook.

### 5.2 Código (revertir el merge)

1. `git revert -m 1 <merge del #162>` en `master` y push. Railway y Vercel vuelven a desplegar el código anterior.
2. OTA: el revert también publica una versión nueva con el código anterior. El número de versión sigue subiendo porque cuenta commits.
3. Las migraciones **no** se deshacen, y no hace falta. Todo lo que agregan es aditivo: tablas nuevas, columnas opcionales o con valor por defecto, e índices. El cliente Prisma anterior las ignora.

### 5.3 Única condición antes de revertir el código

El código anterior no conoce los estados `PENDING_PAYMENT` ni `PENDING_MERCHANT`. Si existe un pedido con esos estados, Prisma falla al leerlo y rompe las pantallas de pedidos. Antes del revert debe devolver 0:

```sql
SELECT count(*) FROM orders WHERE status::text IN ('PENDING_PAYMENT', 'PENDING_MERCHANT');
```

Si no da 0, aceptar o cancelar esos pedidos en el TPV, o apagar `MARKETPLACE_V1_ORDERS_ENABLED` y esperar a que se resuelvan. Los valores del enum se quedan en la base: sin filas que los usen no afectan.

### 5.4 Restaurar el respaldo

Solo como último recurso, si una migración dejara datos inconsistentes, porque pierde todo lo ocurrido después del respaldo. Con migraciones idempotentes y aditivas, lo esperado ante un fallo es corregir y volver a desplegar.

## 6. Evidencia y pendientes

**Verificado:**
- CI del PR #162: lint, tipos, build y pruebas de cada app, y los 4 APKs, en verde. El E2E pasa completo. La repetición intermitente de meseros quedó corregida en `cac66c31` y su verificación en CI está pendiente.
- Verificador del marketplace: 61/61 suites, 1,257 pruebas.
- Jest del backend: 86/86.
- PostgreSQL desechable: red 11/11 y finanzas 8/8.
- Aceptación en navegador del reparto propio (C1) y del GPS del seguimiento (C5).
- Despliegue del #160 a producción el 27/oct: CI, OTA 0.2.476, Vercel y Railway terminados bien.

**No verificado, y necesario antes de la fase 1:**
- Las consultas de la sección 3 contra producción.
- El comando de arranque de Railway.
- Los respaldos de Supabase.

**Pendiente antes de las fases 4 y 5:**
- C6, Mercado Pago sandbox.
- Hallazgos de G8.
- Publicador del outbox de finanzas.
- Aceptación en navegador de la red y de Ops.

**Decisiones del usuario:**
- Comisión.
- Comercios piloto.
- Política de la red por comercio.
- PIN en caja.
- Envío gratis fuera de cobertura.
- Estrategia de OTA (fase 0, punto 4).
