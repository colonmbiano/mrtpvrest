# Plan — pendientes (creado 2026-06-20)

Lista de tareas para retomar mañana. Ordenadas por prioridad sugerida. Todo lo
de **dinero** va como PR con tests + E2E (no push directo), siguiendo las reglas
de `CLAUDE.md` (totales server-side, una sola `$transaction`, multi-tenancy,
sin `prisma db push`).

Contexto reciente: ya quedó desplegado el fix del **fondo del repartidor → suma a
la caja** (PR #106, master `c0f1376`). Ver memoria `project_driver_fund_caja_double_count`.

---

## 1. Reembolso en tickets ya cobrados (por cualquier error) 💰

> **HECHO (2026-06-28):** `POST /api/orders/:id/refund` (total o parcial, monto
> server-side, guard atómico anti-doble-reembolso, cuadre de caja vía
> ShiftExpense REFUND / DriverCashMovement EXPENSE, reposición de inventario en
> total, auditoría `ORDER_REFUND`, permiso `reopen_table`). UI: botón
> "Reembolsar" + panel inline en la pestaña "Cobradas" del TPV. 13 tests del
> endpoint. Migración aditiva `20260628120000_add_order_refund` (correr
> `migrate deploy` manual en prod, Railway no aplica migraciones).

**Qué:** poder **reembolsar** una orden ya pagada (PAID), total o parcial, cuando
hubo un error de cobro. Hoy existen piezas sueltas pero **no** un reembolso de
ticket completo:
- `PUT /api/orders/:id/correct-payment-method` (efectivo↔transfer, no devuelve dinero).
- Anular productos enviados (`modifier-void`, `cancel-restore`).
- No hay "regresar el dinero de una venta cobrada".

**Backend (nuevo endpoint, p. ej. `POST /api/orders/:id/refund`):**
- Reembolso **total o parcial** (monto server-side, nunca del `req.body.total`).
- Todo en una sola `$transaction`: marcar la orden/renglones, registrar el
  reembolso, y **reconciliar la caja**:
  - Si fue efectivo → afecta el corte del turno (resta del esperado / movimiento).
  - Si fue de un repartidor → ajustar su caja (patrón de `correct-payment-method`
    con `DriverCashMovement`, respetando cortes ya cerrados `cashAdjusted:locked`).
- **Inventario:** reponer si el reembolso implica cancelar producto (reusar
  `restoreInventoryForCancelledOrder`, solo en la transición real → estado de devuelto).
- **Auditoría:** evento nuevo tipo `ORDER_REFUND` (quién, cuánto, motivo, parcial/total).
- **Permiso:** gatear (p. ej. `reopen_table`/admin) — no libre.
- **Idempotencia:** evitar doble reembolso (header Idempotency-Key + chequeo de estado).
- **UNIQUE/estado:** no permitir reembolsar dos veces el mismo monto/renglón.

**Frontend (TPV):**
- Botón **"Reembolsar"** en el detalle del ticket dentro de la pestaña **"Cobradas"**
  (ver `project_tpv_paid_tickets_tab`, `apps/tpv` cajón de tickets).
- Modal: total vs parcial, motivo (obligatorio), confirmación, reimpresión de
  comprobante de reembolso.

**Aceptación:** un ticket PAID se puede reembolsar; el corte del turno y/o la caja
del repartidor cuadran tras el reembolso; queda auditado; no se puede reembolsar
dos veces; tests del endpoint (total, parcial, efectivo, repartidor, doble-intento).

---

## 2. Botón "Turnos anteriores" en la pantalla de abrir turno 🗂️

**Qué:** en la pantalla de **abrir turno**, un botón que muestre los **turnos
anteriores** (cerrados) de la sucursal: fecha, quién cerró, esperado/contado,
diferencia, ventas. Hoy el historial vive en admin (`apps/tpv/.../admin/cortes`),
pero no es accesible desde el flujo de abrir turno.

**Backend:** revisar si ya existe un GET de historial de turnos
(`/api/shifts` con paginación por `locationId`); si no, agregarlo (read-only,
filtrado por tenant/sucursal, payload ligero). Reusar el reveal por PIN admin si
se quiere ver el detalle ciego (`/shifts/:id/reveal`).

**Frontend:** botón en la pantalla de abrir turno → lista de turnos cerrados
(read-only) con opción de **reimprimir el ticket de cierre** de cada uno.

**Aceptación:** desde abrir turno se ven los últimos N turnos cerrados con sus
totales; solo lectura; respeta el corte ciego (detalle por PIN si aplica).

---

## 3. (pendiente) UI "Asignar fondo para compras" en la app del repartidor

**Contexto:** el backend ya refleja el fondo del repartidor como ingreso de caja
(`ShiftCashIn FONDO_REPARTIDOR`, PR #106). Falta la UI clara para asignarlo por el
camino correcto en vez de capturarlo como "Ingreso" genérico.

**Qué:** acción **"Asignar fondo"** (cambio / compras) en
`apps/tpv/.../admin/DriverMovementsModal.tsx` y/o la app `apps/delivery`, que pegue
a `POST /api/driver-cash/:driverId/float` (o `/movements` INCOME con categoría
clara). Mostrar el fondo asignado en el resumen de la caja del repartidor.

**Aceptación:** asignar un fondo desde la UI lo registra como fondo (no como cobro)
y suma al efectivo esperado de la caja.

---

## 4. (pendiente) Panel de "Transferencias del turno" en vivo

**Contexto / bug reportado:** los cobros por transferencia **solo se ven al cerrar**
el turno (`cash_shifts.totalTransfer`). No hay vista en vivo de "transferencias
recibidas".

**Backend (nuevo):** `GET /api/shifts/active/transfers` (declarar **antes** de
`/:id` por el orden de Express). Resuelve el turno abierto por `locationId`, lista
órdenes del turno con `paymentMethod IN ('TRANSFER','SPEI','OXXO')`, devuelve
`{ orders:[{orderNumber,total,paymentMethod,createdAt}], total, count }`. Filtrar
por tenant del request, nunca del payload.

**Frontend:** tarjeta/pestaña "Transferencias del turno" en `ShiftModal` (TPV),
con lista + total en vivo (SWR/refetch al abrir).

**Aceptación:** durante el turno se ven las transferencias cobradas y su total, sin
tener que cerrar.

---

### Notas
- Hoy quedó cerrado con +$914.70 de sobrante ficticio (era el fondo de $1,000 sin
  registrar). Real ≈ −$85 de morralla. Mau debe ~$193 del fondo de tu bolsa.
- Memoria relevante: `project_driver_fund_caja_double_count`,
  `project_tpv_paid_tickets_tab`, `project_correct_payment_method`,
  `project_shift_close_ticket`, `project_shift_preview_admin_pin`.
