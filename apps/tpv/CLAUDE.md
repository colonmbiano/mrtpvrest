# CLAUDE.md — apps/tpv

App de Punto de Venta para Master Burger's.
Deploy: `tpv.masterburguers.com` (Vercel, repo `master-burguers-tpv`)

---

## Stack

| | |
|---|---|
| Framework | Next.js 14 (App Router) |
| Auth | PIN de empleado (tabla `Employee`) |
| API | Backend en Railway vía env `NEXT_PUBLIC_API_URL` |
| Impresión | WiFi  via printer-agent local |
| APK Android | Capacitor (`pnpm run build:apk`) |

---

## Autenticación

- Login **solo por PIN numérico** — sin email ni password
- El token JWT viene de la tabla `Employee`, no de `User`
- El middleware del backend acepta ambos tipos de token (`Employee` y `User`)
- Incluir siempre el token en headers: `Authorization: Bearer <token>`

---

## Reglas Críticas

- ❌ No agregar login por email/password — el TPV es exclusivo de empleados por PIN
- ❌ No usar `req.restaurantId` solo — siempre `req.user?.restaurantId || req.restaurantId`
- ❌ No hardcodear `restaurantId` — viene del JWT decodificado
- ✅ Toda llamada a la API debe incluir el token del empleado autenticado

---

## Módulos del TPV

### Pantalla principal
- Toma de pedidos (mesa / para llevar / delivery)
- Selección de productos por categoría
- Carrito con modificadores y notas

### Tab "💵 Efectivo"
- Lista pedidos de delivery con `cashCollected = false`
- Cajero confirma la recepción del efectivo al final del turno
- Endpoint: `PUT /api/orders/:id/confirm-cash`
- Campos en `Order`: `cashCollected`, `cashCollectedAt`, `cashCollectedBy`

### Turnos de caja
- Apertura y cierre de `CashShift`
- Registro de gastos via `ShiftExpense`
- El cajero que cierra el turno confirma todos los efectivos pendientes

### Config Modal
- Gestión de impresoras (nombre, IP, puerto)
- Preview de ticket en vivo
- Modelo `Printer` — campos pendientes: `connectionType`, `usbPort`, `bluetoothAddress`


---

## Flujo de Pedido con Delivery

1. Cajero crea pedido tipo `delivery`, asigna repartidor
2. Repartidor entrega y confirma sin marcar efectivo (`cashCollected = false`)
3. Cajero ve el pedido en tab "💵 Efectivo"
4. Al cerrar turno, cajero confirma recepción: `PUT /api/orders/:id/confirm-cash`

---

## Variables de Entorno

```env
NEXT_PUBLIC_API_URL=https://<backend-railway-url>
```

---

## Comandos

```bash
# Desarrollo local
pnpm --filter @mrtpvrest/tpv dev

# Build
pnpm --filter @mrtpvrest/tpv build

# Build APK Android (Capacitor)
pnpm --filter @mrtpvrest/tpv run build:apk

# Deploy (automático al hacer push a master en Vercel)
git push
```

---

## Lo que NO tocar sin consultar

- Lógica de PIN auth — cualquier cambio rompe el acceso de todos los empleados
- Flujo de `CashShift` — afecta el cuadre de caja
- Tab "💵 Efectivo" — flujo crítico de control de efectivo delivery