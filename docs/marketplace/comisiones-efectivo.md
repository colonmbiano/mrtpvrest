# Comisiones de pedidos en efectivo (C5)

Corte: 9 de noviembre de 2026. En un pedido del Mercadito pagado en efectivo el comercio cobra todo al cliente, así
que la comisión de la plataforma queda como deuda del comercio. Antes no había dónde verla ni cómo cobrarla. Ahora hay
un estado de cuenta mensual por comercio que se emite y se marca pagado desde el panel SaaS.

## Qué entra

| Pedido | ¿Cobra comisión en el estado de cuenta? |
| --- | --- |
| Efectivo, entregado | Sí |
| Efectivo, cancelado | No |
| Efectivo, todavía en curso | No todavía: se avisa y bloquea la emisión del mes |
| En línea (Mercado Pago) | No: su comisión iría en el split de Mercado Pago (C3, pospuesto) |

- El mes es el calendario de la Ciudad de México: un pedido del 31 de octubre a las 23:59 es de octubre aunque en UTC
  ya sea 1 de noviembre. Cuenta la fecha en que se hizo el pedido, no la de entrega.
- La comisión de cada pedido es la que quedó guardada al crearlo (`settlement.platformFeeCents`, o `commissionCents`
  en pedidos viejos). Cambiar el porcentaje después no cambia meses anteriores.
- Durante el piloto la comisión es 0%, así que los totales dan $0.00 y al emitir el mes queda pagado solo
  (referencia "Sin comisión (0%)").
- Un pedido en efectivo no pasa por el libro contable (no hay pago de pasarela); el estado de cuenta emitido es el
  registro de esa deuda.

## Ciclo de un mes

1. **Mes en curso** (`OPEN`): se calcula en vivo, no se guarda.
2. **Por emitir** (`TO_ISSUE`): el mes terminó y nadie lo ha emitido. Para emitir no debe quedar ningún pedido en
   efectivo del mes sin entregar ni cancelar, ni pedidos sin comisión registrada.
3. **Emitido** (`ISSUED`): las líneas (pedido, folio, fecha, subtotal, porcentaje, comisión) se congelan en
   `marketplace_commission_statements` con su hash SHA-256. Si después cambia un pedido de ese mes, lo emitido no se
   mueve y el detalle avisa con `changedSinceIssue`.
4. **Pagado** (`PAID`): se registra la referencia del pago (SPEI, folio, recibo), quién y cuándo.

Emitir dos veces el mismo mes devuelve el mismo estado de cuenta (índice único por comercio y mes). Marcar pagado solo
pasa de emitido a pagado; repetir con la misma referencia devuelve lo mismo, con otra referencia responde 409.

## API

Base `/api/marketplace/v1`. Mismo resolvedor de identidad de personal que liquidaciones.

| Ruta | Quién | Qué hace |
| --- | --- | --- |
| `GET /ops/commissions?period=AAAA-MM` | SUPER_ADMIN, FINANCE de plataforma | Todos los comercios del mes con totales |
| `GET /ops/commissions/:restaurantId?period=` | Plataforma | Detalle con líneas |
| `POST /ops/commissions/:restaurantId/issue` `{ period }` | Plataforma | Emite (congela) un mes cerrado |
| `POST /ops/commissions/:restaurantId/pay` `{ period, reference, note? }` | Plataforma | Marca pagado |
| `GET /merchant/commissions?period=` | ADMIN, MERCHANT_OWNER, FINANCE del comercio | Su mes y sus últimos 12 estados de cuenta |

Errores con `errorCode`: `PERIOD_OPEN`, `ORDERS_PENDING`, `INVALID_SETTLEMENT`, `NOTHING_TO_ISSUE`,
`STATEMENT_NOT_FOUND`, `ALREADY_PAID`, `COMMISSIONS_FORBIDDEN`, `MERCHANT_FORBIDDEN`, `INVALID_PERIOD`.

## Dónde está

- Servicio: `apps/backend/src/lib/marketplace-commissions.js`; rutas en `routes/marketplace-settlements-v1.routes.js`.
- Tabla: `marketplace_commission_statements` (migración `20261109200000_marketplace_commission_statements`, solo
  agrega; con `CHECK` de montos no negativos y de pagado con fecha y autor). Modelo en `SCOPED_MODELS`.
- Panel SaaS: Marketplace → "Comisiones por cobrar (efectivo)" (`CommissionStatementsSection.tsx`,
  `lib/marketplaceCommissions.ts`).
- Pendiente: vista del comercio en el admin (la ruta `GET /merchant/commissions` ya existe).

## Evidencia

- `apps/backend/scripts/marketplace-commissions.test.cjs` 16/16 (calendario, filtros, emisión, pago, permisos,
  rutas, paginación de 1,203 pedidos); `marketplace-settlements-v1` 25/25; jest del backend 954/954.
- PostgreSQL 16 desechable con el guard en ENFORCE (`marketplace-settlements-postgres.test.cjs --disposable`, 13/13):
  octubre con 3 pedidos que cuentan y cancelado, en línea, de noviembre y de otro comercio fuera; dos emisiones a la
  vez dejan una sola fila; dos pagos a la vez, solo uno gana; los `CHECK` rechazan pagado sin fecha y montos negativos.
- SaaS: `apps/saas/scripts/marketplace-commissions.test.mjs` 5/5, `tsc` sin errores; en navegador con la API simulada
  se emitió un mes en 0% (quedó pagado), se registró un pago con referencia y un comercio con un pedido abierto no
  ofreció "Emitir".
