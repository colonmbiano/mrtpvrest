# MRTPVREST Marketplace: estado actual y modelo TPV + Marketplace

**Fecha:** 23 de octubre de 2026
**Rama:** `feature/marketplace-hibrido`
**Resumen:** el marketplace **todavía no es operativo**. Hay mucho construido y probado, pero falta la parte que permite vender de verdad. El TPV se mantiene como producto base; el marketplace será un canal de venta adicional, opcional por negocio.

---

## 1. ¿Ya es operativo?

No todavía.

### Lo que ya funciona (en local y en la preview de Vercel)

- **Vitrina del marketplace:** catálogo, tiendas y carrito multi-tienda.
- **Checkout de prueba** con los menús públicos reales de Master Burguer's y Tokki Boba. No cobra, no envía nada al TPV ni a cocina y guarda las órdenes solo en archivos locales (`.marketplace-local/pedidos-prueba`).
- **App del repartidor rediseñada:** hub con "Mi ruta" y "Marketplace".
- **PIN de entrega para pedidos propios a domicilio:** el servidor lo genera y lo verifica, el cliente lo ve en "Mis pedidos" y por WhatsApp, y el repartidor lo pide antes de entregar. Está apagado por defecto (`STORE_DELIVERY_PIN_MODE=off`).
- **Migración de base de datos que faltaba:** generada y probada en una base PostgreSQL local desechable. Todavía no se aplica en ninguna base real.
- **Pruebas:** pasan todas las suites del backend, jest (650/650), el e2e del piloto, 6 suites del cliente y 5 de la app del repartidor; `tsc` pasa en el cliente y en la app del repartidor.

### Lo que falta para que sea real

| Área | Estado hoy | Detalle |
|---|---|---|
| **Comprar** | No funciona | Cotización y orden v1 están programadas pero sin adaptadores a la base de datos: responden 503 en cualquier entorno real. |
| **Cobrar** | No funciona | La conexión con Mercado Pago (`marketplace-payments.routes.js`) no está montada en el backend. |
| **Repartir** | No funciona | El despachador híbrido vive en memoria y nadie lo alimenta; todo repartidor recibe `COURIER_FORBIDDEN`. Las órdenes del marketplace no llegan al despachador. |
| **Recibir en el TPV** | No funciona | El TPV solo lista los estados `PENDING`, `OPEN`, `CONFIRMED`, `PREPARING`, `READY` y `PACKING`; los pedidos del marketplace entran como `PENDING_MERCHANT` o `PENDING_PAYMENT`. Ni el TPV, ni el KDS, ni el admin tienen código para pedidos del marketplace. |
| **Dar de alta comercios** | Manual | Los comercios se publican con una lista fija en `MARKETPLACE_STORE_SLUGS`. Falta la aprobación de comercios para el directorio. |
| **Cuentas globales** | Solo staging | Las cuentas de comprador y repartidor del marketplace solo arrancan en un staging aislado. |
| **Publicar** | Bloqueado | Nada está desplegado. Next.js 16.2.9 tiene avisos críticos de seguridad y la migración nueva no está aplicada en ninguna base real. |

> El documento `backend-v1-plan-completado.md` dice "100% COMPLETADO". Se refiere a contratos y servicios con pruebas, no a que la API funcione con la base de datos real.

---

## 2. Cómo encajan el TPV y el marketplace

El diseño actual ya sigue este modelo: **el TPV es el producto base y el marketplace es un canal de venta más**, igual que la tienda en línea y el bot de WhatsApp.

- **Cada comercio del marketplace es un negocio del SaaS:** su restaurante y su sucursal (`restaurantId` + `locationId`).
- **Un pedido del marketplace es un pedido normal del restaurante**, marcado con `source: 'MARKETPLACE'`, en la misma tabla `orders`.
- **El menú se administra una sola vez, en el TPV.** El marketplace lee ese mismo menú.
- Quien no quiera el marketplace sigue usando el TPV exactamente como hoy.

### Opciones para los negocios

| Plan | Qué incluye |
|---|---|
| **Solo TPV** (como hoy) | Caja, cocina, tienda propia, WhatsApp y repartidores propios. Nada cambia para quien no quiera el marketplace. |
| **TPV + Marketplace** | Lo mismo, más aparecer en el marketplace. Los pedidos llegan al mismo TPV y KDS, y se cobra una comisión por pedido. |
| *Solo marketplace* (opcional, más adelante) | Para negocios sin caja: una versión reducida del TPV que solo recibe pedidos y administra el menú. |

**Recomendación:** empezar con **TPV + Marketplace**, porque reutiliza toda la operación que ya funciona (TPV, KDS, caja, repartidores propios). El plan "solo marketplace" puede venir después como una versión reducida del mismo TPV, no como una app aparte.

### Cómo viajaría un pedido

1. El cliente compra en el marketplace (cotización con precios del servidor y orden con `Idempotency-Key`).
2. El pedido aparece en el TPV y el KDS del comercio con la etiqueta **"Marketplace"** y el estado **"por aceptar"**.
3. El comercio lo acepta o lo rechaza.
4. Cocina lo prepara como cualquier otro pedido.
5. Lo entrega un **repartidor propio** (la app actual) o uno de la **red compartida** (despacho híbrido), siempre con PIN de recogida y PIN de entrega.
6. La **liquidación** descuenta la comisión y le paga al comercio (libro contable de doble partida ya programado).

---

## 3. Qué construir, en orden

1. **El TPV y el KDS reciben los pedidos del marketplace.** Mostrar `source: 'MARKETPLACE'` y los estados `PENDING_MERCHANT` / `PENDING_PAYMENT`, con botones de aceptar y rechazar.
2. **Módulo "Marketplace" por negocio.** Activarlo con el sistema de módulos que ya existe (`tenant_modules`) y agregar la aprobación de comercios para el directorio (pendiente: `MarketplaceMerchantMembership` con `PENDING` / `APPROVED` / `SUSPENDED`).
3. **Conectar cotización, orden y pago a la base de datos real:** adaptadores Prisma para los servicios v1 y montar la conexión con Mercado Pago.
4. **Despachador con persistencia,** en lugar del almacén en memoria, alimentado por las órdenes del marketplace.
5. **Panel de liquidaciones para el comercio:** comisiones, pagos y reembolsos.

---

## 4. Bloqueos antes de cualquier despliegue

Vienen de la auditoría general del 23/oct:

- [x] **Migración que faltaba:** `packages/database/prisma/migrations/20261023210000_reconcile_marketplace_branch_drift/` (commit local `e9c63b28`). Probada en una base local desechable: las 94 migraciones aplican desde cero y es idempotente. **Falta aplicarla** en un entorno real, en una ventana de poco tráfico (crea índices únicos en `orders`, `locations` y `menu_items`).
- [x] **Protecciones de push restauradas:** `push.default=nothing`, `pushurl` a `127.0.0.1:9` y hook `pre-push`. Todo push falla hasta que el usuario lo autorice.
- [ ] **Actualizar Next.js a 16.4.1 o superior** (avisos críticos de ejecución remota) y axios a 1.20 o superior, en todo el monorepo.
- [ ] **Ocultar la pestaña Marketplace de la app del repartidor en producción** hasta que el despachador guarde sus datos.
- [ ] **Endurecer los PIN:** límite de intentos, HMAC en lugar de SHA-256 sin sal, y no darle al comprador el PIN de recogida.
- [ ] **Secretos JWT propios del marketplace,** en lugar de reutilizar el `JWT_SECRET` del SaaS.
- [ ] **Push de los commits locales** cuando el usuario lo autorice, revisando antes el destino y lo que se despliega automáticamente.

---

## 5. Decisiones pendientes del negocio

- ¿El marketplace será solo un módulo para negocios con TPV, o también habrá un plan "solo marketplace"?
- Comisión por pedido: porcentaje, monto fijo o ambos, y quién paga el envío.
- ¿Quién aprueba los comercios que aparecen en el directorio y con qué requisitos?
- Repartidores de la red compartida: requisitos de alta, zonas y forma de pago.
