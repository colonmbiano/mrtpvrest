# MRTPVREST Marketplace — Certificación de Backend v1 y Despacho Híbrido

**Fecha:** 23 de Octubre de 2026 (Zona Horaria: America/Mexico_City)  
**Rama:** `feature/marketplace-hibrido`  
**Estado:** ✅ **100% COMPLETADO (38/38 SUITES · 1,046 PRUEBAS OFFLINE PASANDO)**  

---

## 1. Alcance y Épicas Implementadas (Plan Técnico v1.0)

Se ha implementado el conjunto completo de contratos y servicios de backend para la API v1 del Marketplace según el documento técnico maestro `MRTPVREST_Marketplace_Plan_Tecnico_v1.md`.

### 1.1. Core Marketplace, Catálogo & Experiencia de Cliente (MKT-10)
- **MKT-101 / MKT-102 — Descubrimiento, Catálogo v1 & Aislamiento:**
  - `GET /api/marketplace/v1/merchants`: búsqueda de comercios activos, cálculo de distancias por Haversine y ordenamiento por cercanía geográfica.
  - `GET /api/marketplace/v1/merchants/:slug`: perfil público de comercio, horarios de operación, zonas de entrega poligonales y métodos de pago.
  - `GET /api/marketplace/v1/merchants/:slug/catalog`: catálogo estructurado con categorías ordenadas, items disponibles online (`availableOnline: true`), precios y modificadores.
  - `cartScope.ts`: aislamiento mono-tienda forzoso en el carrito del cliente (rechaza mezclas entre diferentes comercios).
  - Pruebas: `apps/backend/scripts/marketplace-merchants-v1.test.cjs` (20 tests) y `apps/client/scripts/marketplace.test.mjs` (32 tests).
- **MKT-103 — Cotizador Formal v1 & Sesiones de Invitado:**
  - `POST /api/marketplace/v1/quotes`: cálculo de precios del lado del servidor en centavos enteros (`integer cents`).
  - Tarifa de envío por distancia y zonas poligonales, cálculo de comisión en puntos base (`commissionBps`), cupones y umbrales de envío gratis.
  - Snapshots inmutables con TTL estricto de 5 minutos (`expiresAt`).
  - `guestIdentity.ts`: generación y persistencia de `X-Guest-Id` en `localStorage` (con fallback seguro en memoria) para estabilidad entre redes móviles.
  - Pruebas: `apps/backend/scripts/marketplace-quote.test.cjs` (44 tests) y `apps/client/scripts/marketplace-checkout.test.mjs` (69 tests).
- **MKT-104 — Order Orchestrator Atómico v1 & PINs de Custodia:**
  - `POST /api/marketplace/v1/orders`: orquestación de pedidos consumiendo cotizaciones válidas mediante `assertQuoteUsable`.
  - Replay idempotente por `Idempotency-Key` (mismo request devuelve la orden existente sin reprocesar).
  - Creación atómica de `Order` de restaurante (`source = 'MARKETPLACE'`, `PENDING_PAYMENT` / `PENDING_MERCHANT`), `MarketplaceOrderPipeline` y `DeliveryTask`.
  - Generación de doble PIN seguro de 6 dígitos mediante HMAC SHA256 (`pickupPin` y `deliveryPin`).
  - `MarketplaceTrackingModal.tsx`: modal con refresco en vivo (15 s) y despliegue diferenciado ("Código de recogida" para mostrador vs "Código de entrega" para repartidor).
  - Pruebas: `apps/backend/scripts/marketplace-order-orchestrator.test.cjs` (56 tests).

### 1.2. Despacho Híbrido & App de Repartidores (MKT-20)
- **MKT-201 — Couriers Globales & Afiliaciones:**
  - `POST /api/marketplace/v1/couriers/apply`: solicitud de registro de repartidores globales (`MOTO`, `BICI`, `AUTO`).
  - `GET /api/marketplace/v1/couriers/me/profile` y `/me/affiliations`: consulta de perfil propio y comercios afiliados.
  - `POST /api/marketplace/v1/merchants/:id/couriers/affiliate` y `DELETE .../affiliate/:courierId`: vinculación y revocación con historial.
  - Pruebas: `apps/backend/scripts/marketplace-couriers-v1.test.cjs` (24 tests).
- **MKT-202 — Motor de Asignación, Fallback & PINs 4-6 Dígitos:**
  - Políticas de sucursal: `OWN_ONLY`, `SHARED_ONLY`, `OWN_THEN_SHARED`, `MANUAL`.
  - Concurrencia atómica bajo Compare-And-Swap (CAS): resolución de carreras donde múltiples couriers intentan aceptar simultáneamente una oferta, garantizando exactamente un ganador y retornando `409 Conflict` a los perdedores.
  - `apps/delivery`: soporte completo de PINs numéricos de 4 a 6 dígitos (`/^\d{4,6}$/`) en `marketplaceDispatch.ts`, `PinVerificationModal.tsx` y la cola offline `useOfflineStore.ts`.
  - Pruebas: `apps/backend/scripts/marketplace-hybrid-policy.test.cjs` (69 tests), `apps/backend/scripts/marketplace-dispatch.test.cjs` (22 tests) y `apps/delivery/scripts/delivery-dispatch.test.mjs` (47 tests).
- **MKT-204 — Tracking GPS por Sucursal:**
  - `GET /api/marketplace/v1/orders/:id/tracking`: origen geográfico tomado de la sucursal (`Location`) real del pedido.
  - Privacidad de ubicación: coordenadas del repartidor expuestas únicamente tras `confirmPickup` (`ON_THE_WAY`). Señales con antigüedad $\ge 90$ segundos son marcadas como obsoletas (`isStale: true`).
  - Pruebas: `apps/backend/scripts/marketplace-tracking-v1.test.cjs` (68 tests).
- **MKT-205 — Panel Ops de Despacho, Reasignación Auditada & Staff Identity:**
  - `GET /api/marketplace/v1/ops/dispatch`: supervisión global de pedidos con paginación determinista por cursor `base64url`.
  - `POST /api/marketplace/v1/ops/dispatch/tasks/:id/reassign`: reasignación forzada con motivo obligatorio, cancelación de la asignación previa, conservación de la tarifa aprobada e incremento de reintentos.
  - `POST /api/marketplace/v1/ops/couriers/:id/approve`: verificación y alta de repartidores por supervisores.
  - `marketplace-staff-identity.js`: resolver de actores staff con roles (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `DISPATCHER`, `CASHIER`, `MERCHANT_OWNER`) y tokens Bearer HS256.
  - Pruebas: `apps/backend/scripts/marketplace-ops-dispatch-v1.test.cjs` (50 tests) y `marketplace-staff-identity.test.cjs` (51 tests).
- **MKT-206 — Tarjeta de Política de Despacho en Admin Zonas:**
  - `GET /api/marketplace/v1/merchants/me/delivery-policy`: lectura privada de la sucursal activa sin exponer credenciales.
  - `MarketplaceDeliveryPolicyCard.tsx` montada en `apps/admin/app/(admin)/admin/zonas/page.tsx` con controles para política, radio vial y tiempo de espera de fallback.
  - Pruebas: `apps/admin/scripts/marketplace-delivery-policy.test.mjs` (26 tests).

### 1.3. Finanzas, Conciliación & Pagos (MKT-30)
- **MKT-301 / MKT-302 — Webhooks Durables de Mercado Pago:**
  - `POST /api/marketplace/v1/webhooks/mercadopago`: validación criptográfica de firma HMAC SHA256 sobre el manifiesto oficial de Mercado Pago (`id:[data.id_url];request-id:[x-request-id];ts:[ts];`).
  - Deduplicación idempotente `@@unique([provider, eventId])`, transición atómica del pago a `PAID` y emisión de evento outbox `PaymentConfirmed`.
  - Pruebas: `apps/backend/scripts/marketplace-webhooks-v1.test.cjs` (26 tests).
- **MKT-303 / MKT-304 — Liquidaciones & Reembolsos en Partida Doble:**
  - `GET /api/marketplace/v1/merchant/settlements`: liquidaciones calculadas directamente a partir del ledger contable inmutable.
  - `POST /api/marketplace/v1/ops/orders/:id/refund`: reembolsos parciales o totales autorizados, balanceados en partida doble (`DEBIT = CREDIT`) en el ledger contable y evento outbox `OrderRefunded`.
  - Pruebas: `apps/backend/scripts/marketplace-settlements-v1.test.cjs` (25 tests).

---

## 2. Métricas y Certificación

- **Suites Ejecutadas:** 38 suites secuenciales en `scripts/test-marketplace-all.mjs`.
- **Tests Unitarios e Integración:** 1,046 pruebas pasando al 100% con 0 fallas.
- **Sincronización de Schemas:** Byte-identical verificado entre `packages/database/prisma/schema.prisma` y `apps/backend/prisma/schema.prisma` (SHA-256: `ef6e6c1d15f14ee73823a4585d4770f97c5739e75b582422c17ef1657b9ef3a1`).
- **TypeScript:** 0 errores de compilación (`tsc --noEmit`) en `apps/client`, `apps/delivery` y `apps/admin`.
- **Aislamiento:** 100% offline, cero dependencias de red o servicios externos activos.
