# Pagos diarios al repartidor independiente (C8)

Corte: 10 de noviembre de 2026. Decisión: el repartidor independiente de la red se queda con el **100% del envío**
y se le **paga cada día**. Antes no había registro de cuánto ganaba ni de quién le pagaba.

## Cómo se arma el día

Por cada repartidor y cada comercio con el que entregó, el día calendario de la Ciudad de México:

| Pedido | El repartidor… | Queda |
| --- | --- | --- |
| Efectivo | cobra el total al cliente y se queda su envío | le debe al comercio el resto (`cashToMerchantCents`) |
| En línea | no toca dinero; el pago entró al comercio | el comercio le debe el envío (`onlineEarningsCents`) |

`netCents = onlineEarningsCents − cashToMerchantCents`. Positivo: el comercio le paga esa cantidad. Negativo: el
repartidor entrega ese efectivo al comercio. Cero: no hay nada que mover. Un solo movimiento salda el día.

Ejemplo (prueba en PostgreSQL): un pedido en efectivo de $155 (envío $35) y uno en línea de $200 (envío $40). Ganó
$75; cobró $155; debe $120 al comercio por el efectivo y el comercio le debe $40 → entrega **$80** netos.

Cuentan solo los pedidos de la red **entregados** ese día por ese repartidor (tarea entregada con su asignación y la
orden entregada). Un pedido cancelado no cuenta. El envío de cada pedido es el que quedó congelado al crearlo.

## Ciclo

1. **Hoy** se ve en vivo (`OPEN`).
2. **Cada madrugada** (03:17 CDMX, `jobs/courierPayouts.job.js`, solo con la red encendida) se emite el corte del día
   anterior y, por si una madrugada falló, se revisa también el de antier. Emitido (`ISSUED`), queda congelado con su
   hash; emitir dos veces no duplica (único por comercio, repartidor y día). Sin nada que saldar queda `PAID` con
   referencia "Sin saldo".
3. **El comercio lo marca saldado** (`PAID`) con la referencia del pago o del efectivo recibido; condicional, un solo
   ganador si dos personas lo marcan a la vez.
4. **Libro contable**: si los envíos en línea de ese día ya están liquidados en el libro (`COURIER_PAYABLE` con el
   repartidor como beneficiario, al conciliar el pedido), al saldarse se asienta `PAYOUT_DISBURSED` (debe
   `COURIER_PAYABLE`, haber `PAYOUT_CLEARING`) en la misma transacción. Así el saldo del libro del repartidor baja a
   cero cuando se le paga, y la billetera lo muestra.

Un pedido entregado desde la caja (sin que el repartidor confirme con PIN) ahora también lleva fecha de entrega en
la tarea de la red, para que entre al corte del día.

## API

| Ruta | Quién | Qué |
| --- | --- | --- |
| `GET /api/marketplace/v1/couriers/me/wallet?days=14` | Repartidor (Bearer de la app) | Hoy en vivo, cortes de los últimos días, "te deben", "debes entregar" y saldo del libro |
| `GET /api/marketplace/v1/merchant/courier-payouts?date=` | ADMIN / OWNER / MERCHANT_OWNER del comercio | Cortes del día por repartidor (hoy en vivo) |
| `POST /api/marketplace/v1/merchant/courier-payouts/:id/pay` `{ reference, note? }` | Comercio o SUPER_ADMIN | Marca saldado |
| `POST /api/marketplace/v1/ops/courier-payouts/issue` `{ date }` | SUPER_ADMIN | Emite a mano un día terminado |

## Dónde está

- Servicio `apps/backend/src/lib/marketplace-courier-payouts.js`; calendario CDMX compartido con C5 en
  `lib/mx-calendar.js`; job `jobs/courierPayouts.job.js` (registrado en `lib/runtime-policy.js`).
- Tabla `marketplace_courier_payouts` (migración `20261110080000_marketplace_courier_payouts`, solo agrega; `CHECK` de
  montos, neto cuadrado y pagado con fecha y autor). En `SCOPED_MODELS`.
- App del repartidor: "Mis ganancias" en la pantalla del repartidor independiente
  (`apps/delivery/src/components/delivery/CourierWallet.tsx`, `src/lib/courierWallet.ts`).
- Pendiente: la pantalla del comercio en el admin para ver y marcar saldado → **X16** (Codex). Mientras tanto, la
  ruta existe y la plataforma puede marcarlo.

## Evidencia

- Unitarias `marketplace-courier-payouts.test.cjs` 11/11 (día CDMX, efectivo/en línea, exclusiones, emisión
  idempotente, pago con permisos y reintento, libro, billetera, vista del comercio, job, rutas); `runtime-policy` 9/9.
- PostgreSQL desechable `marketplace-courier-payouts-postgres.test.cjs --disposable` 4/4: la red entrega un pedido en
  efectivo y uno en línea y otro se cancela; el pedido en línea se concilia (COURIER_PAYABLE $40); dos instancias
  emiten el corte del 9/nov una sola vez (2 entregas, ganó $75, cobró $155, entrega $80); el comercio lo salda (dos
  clics a la vez, uno gana) y COURIER_PAYABLE queda en 0 con `PAYOUT_DISBURSED` balanceado; los `CHECK` rechazan un
  neto que no cuadra y pagado sin fecha.
- App del repartidor: `courier-wallet.test.mjs` 4/4, `tsc` sin errores, y en navegador (390 px, API simulada) la
  billetera muestra totales, hoy en curso, "Entrega $80.00 a Master Burger's", "Bobbas y Helado te paga $40.00" y un
  día saldado.
