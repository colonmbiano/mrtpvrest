# Plan: migración Float → Decimal en campos monetarios

> Último pendiente del plan de remediación (docs/AUDITORIA-VALIDACION.md).
> NO ejecutar de golpe: es la migración con mayor radio de impacto del repo.

## Por qué no es un simple ALTER TABLE

1. **Prisma devuelve `Decimal` (decimal.js), no `number`.** Todo `res.json()`
   serializa Decimal como **string** (`"125.50"`). Cada frontend que hace
   `order.total.toFixed(2)`, `subtotal + tip` o `total * 1.16` se rompe o
   concatena strings. Hay ~50 campos así consumidos por 7 apps (tpv, admin,
   kds, client, delivery, kiosk, meseros-lite).
2. El backend hace aritmética nativa (`money.js`, cortes, CMV) que con
   Decimal exige `.toNumber()` o la API de decimal.js.
3. El riesgo actual está mitigado: `computeOrderTotals` + `round2()` son
   server-side y redondean a centavos en cada frontera (auditado 2026-06-12).

## Estrategia recomendada: serialización centralizada + migración por etapas

### Etapa 0 — Salvaguarda de serialización (sin tocar la BD) ✅ HECHA 2026-07-01
En el backend, registrar un replacer global que convierta Decimal → number
al serializar (Express `app.set('json replacer', ...)` o un util `toJSON`):
```js
// Decimal de Prisma → number en TODAS las respuestas JSON.
// Mantiene el contrato actual de los frontends (number, 2 decimales).
app.set('json replacer', function (key, value) {
  return (value && typeof value === 'object' && value.constructor?.name === 'Decimal')
    ? Number(value)
    : value;
});
```
Con esto, cambiar el tipo de una columna NO cambia el contrato HTTP.
Desplegar y verificar que nada cambió (es no-op mientras no haya Decimals).

### Etapa 1 — Piloto de bajo riesgo ✅ HECHA 2026-07-01 (migración 20260701140000_coupon_money_to_decimal)
Migrar UN modelo de bajo tráfico y verificar end-to-end:
- Candidato: `Coupon.discountValue` + `Coupon.minOrderAmount`.
- Migración: `ALTER TABLE ... TYPE DECIMAL(12,2) USING round(col::numeric, 2)`.
- schema.prisma: `Decimal @db.Decimal(12,2)`.
- Backend: revisar aritmética sobre esos campos (`Number(x)` donde haga falta).
- Probar: cupón en storefront + admin de cupones.

### Etapa 2 — Dinero transaccional (el grueso)
Orden sugerido (cada uno = migración + barrido de aritmética + smoke):
1. `MenuItem.price/promoPrice`, `Modifier.priceAdd`, variantes/complementos.
2. `Order.subtotal/total/discount/deliveryFee/tip`, `OrderItem.price/subtotal`.
3. `PaymentTransaction.amount`, `CashShift.total*` (cortes).
4. `Invoice.amount`, `Subscription.priceSnapshot` (SaaS).

Precisión: `DECIMAL(12,2)` para montos MXN; `DECIMAL(14,4)` para costos
unitarios/CMV (`Ingredient.cost`, `OrderItem.costSnapshot`).

### Etapa 3 — Stock fraccionario (opcional, evaluar)
`Ingredient.stock` y `StockMovement.delta/balanceAfter` en gramos/ml toleran
float razonablemente; migrar solo si los reportes muestran drift. Si se hace:
`DECIMAL(14,3)`.

## Reglas operativas
- Una etapa por sesión, con `prisma migrate deploy` manual (Railway no corre
  migraciones) y deploy del backend en la MISMA ventana.
- `USING round(col::numeric, 2)` en cada ALTER: los floats existentes traen
  ruido binario (`50.00000000000001`) que el cast debe limpiar.
- Smoke post-etapa: crear orden TPV con modificadores, cobrar, corte de caja,
  pedido web con cupón, y revisar 2 reportes del admin.
- Rollback por etapa: `ALTER ... TYPE DOUBLE PRECISION` (sin pérdida en ese
  sentido) + revert del schema.

## Qué NO hacer
- No usar `@db.Money` (Prisma lo desaconseja: redondeos inesperados).
- No migrar todo en una sola migración "big bang".
- No confiar en que "el replacer lo cubre todo": el barrido de aritmética
  backend por etapa sigue siendo obligatorio (Decimal + number = string en JS).
