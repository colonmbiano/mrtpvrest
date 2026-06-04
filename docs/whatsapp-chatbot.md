# Chatbot de WhatsApp — Toma de pedidos

Asistente conversacional que toma pedidos de **delivery** y **pickup** dentro de
WhatsApp, los crea en el sistema (mismo modelo `Order` que la tienda web y el
TPV) y los notifica en tiempo real a cocina/admin vía Socket.io.

Este documento describe el MVP entregado en la primera fase. Funcionalidades
del pitch comercial que **aún no** están en esta fase (remarketing, juegos
promocionales, reportes por zona) se listan al final como roadmap.

---

## 1. Arquitectura

```
WhatsApp (cliente)
      │  webhook POST
      ▼
/api/whatsapp/webhook/:restaurantId   ← ruta pública, sin tenantMiddleware
      │
      ▼
services/whatsapp-bot/index.js        ← orquestador (sesión + envío)
      ├─ provider.js   normaliza entrada (Whapi/Meta) y envía respuestas
      ├─ engine.js     máquina de estados de la conversación (PURA respecto a BD)
      ├─ catalog.js    carga del menú + selección numerada
      ├─ order.js      crea el Order (revalida precios, calcula envío)
      └─ messages.js   plantillas de texto (es-MX)
```

- **Multi-tenant por URL.** El proveedor de WhatsApp de cada restaurante apunta
  su webhook a `…/api/whatsapp/webhook/<restaurantId>`. El restaurante se
  resuelve por ese id; todas las queries filtran explícitamente por
  `restaurantId` (además del tenant-guard de Prisma).
- **Estado persistido en BD** (`WhatsappSession`), no en memoria: el backend de
  Railway se reinicia en cada deploy y una conversación a medias no debe
  perderse. Caduca por inactividad (`WHATSAPP_SESSION_TTL_MS`, default 6 h).
- **Cálculo de envío compartido.** El bot y la tienda web usan la misma fuente
  de verdad (`lib/delivery-fee.js`), así que ambos canales cobran idéntico.
- **Ack inmediato.** El webhook responde `200` al instante y procesa el mensaje
  en segundo plano (los proveedores reintentan si no ven 200 a tiempo). Los
  `messageId` ya procesados se deduplican en memoria.

## 2. Proveedores soportados

La capa `provider.js` normaliza la entrada y abstrae el envío. Config por
restaurante en `IntegrationConfig` (type `WHATSAPP`), campo `config` (JSON):

```jsonc
{
  "provider": "WHAPI",          // "WHAPI" (default) | "META"
  "token": "…",                 // token del canal (texto o cifrado AES-256-GCM)
  "phoneNumberId": "…",         // requerido solo para META (Cloud API)
  "apiUrl": "…",                // opcional, override del endpoint base
  "verifyToken": "…"            // solo META, para la verificación GET del webhook
}
```

- **WHAPI** (`gate.whapi.cloud`) — default, consistente con las notificaciones
  salientes de estado de pedido que ya usa el sistema. Cada restaurante usa su
  propio canal/token.
- **META** (WhatsApp Cloud API, `graph.facebook.com`) — soporta la verificación
  `GET` con `hub.challenge` y envío vía `/<phoneNumberId>/messages`.

Fallback de plataforma vía env: `WHATSAPP_TOKEN`, `WHATSAPP_API_URL`,
`WHATSAPP_VERIFY_TOKEN`.

## 3. Configuración (por restaurante)

1. En **Integraciones**, habilita `WHATSAPP` y captura `token`
   (y `phoneNumberId` + `verifyToken` si usas Meta).
2. En el panel del proveedor, configura el webhook entrante a:
   `https://api.mrtpvrest.com/api/whatsapp/webhook/<restaurantId>`
   - Meta: usa primero el `GET` de verificación con tu `verifyToken`.
3. Configura el menú (categorías + productos disponibles) y, para delivery, los
   parámetros de envío en `RestaurantConfig` (modo `FLAT` o `DISTANCE`,
   origen, tarifas, radio gratis, máximo de cobertura).

## 4. Flujo de conversación

```
GREETING → ORDER_TYPE → [LOCATION] → CATEGORY ⇄ ITEM → QUANTITY → CATEGORY
         → (finalizar) → NAME → [ADDRESS → [LOCATION_PIN]] → PAYMENT → CONFIRM → ✅
```

- **ORDER_TYPE:** 1 = entrega a domicilio, 2 = recoger en sucursal.
- **LOCATION:** solo si hay >1 sucursal capaz de atender el tipo de pedido.
- **CATEGORY/ITEM/QUANTITY:** menú numerado. Productos con variantes se aplanan
  (cada variante es una línea seleccionable). El cliente responde con números.
- **ADDRESS/LOCATION_PIN:** solo delivery. Si el envío es por `DISTANCE`, se
  pide compartir la ubicación para calcular el costo y validar cobertura.
- **PAYMENT:** efectivo (contra entrega / al recoger) o transferencia.
- **CONFIRM:** muestra el resumen con total y envío; *SÍ* crea el pedido.

Comandos globales en cualquier momento: `menú`, `carrito`, `finalizar`,
`cancelar`, `ayuda`.

## 5. Pedido creado

- `source = "WHATSAPP"`, `orderNumber = "WA-XXXXXX"`, `status = PENDING`,
  `paymentStatus = PENDING`.
- Precios revalidados desde la BD (nunca se confía en la sesión).
- Emite `order:new` por Socket.io a `restaurant:<id>`, `:kitchen` y, si aplica,
  a los canales de la sucursal — igual que la tienda web.

## 6. Variables de entorno

| Variable | Uso |
|---|---|
| `WHATSAPP_TOKEN` | Token de plataforma (fallback de envío) |
| `WHATSAPP_API_URL` | Override del endpoint Whapi (default `gate.whapi.cloud`) |
| `WHATSAPP_VERIFY_TOKEN` | Verify token de plataforma para Meta (fallback) |
| `WHATSAPP_SESSION_TTL_MS` | Vida de sesión inactiva (default 6 h) |
| `AI_ENCRYPTION_KEY` | Para descifrar tokens guardados cifrados |

## 7. Tests

```
pnpm --filter @mrtpvrest/backend exec jest whatsapp-bot
```

- `whatsapp-bot.engine.test.js` — flujos completos (delivery, pickup, distancia,
  cancelar, mínimo de compra, menú vacío, mensajes no soportados).
- `whatsapp-bot.helpers.test.js` — selección numerada, normalización de
  entrada (Whapi/Meta) y cálculo de envío.

## 8. Roadmap (fases siguientes)

- Base de clientes + **remarketing** por WhatsApp/SMS.
- **Juegos promocionales** (descuentos / productos gratis).
- Reportes de ventas por **zona / sucursal** del canal WhatsApp.
- Pago en línea con link de checkout (reutilizando `POST /api/store/payment/create`).
- NLU opcional con Groq para entender pedidos en lenguaje libre.
