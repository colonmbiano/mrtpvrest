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
- **PAYMENT:** efectivo (contra entrega / al recoger), transferencia o —si el
  restaurante tiene pasarela habilitada— **pago en línea (tarjeta)**.
- **CONFIRM:** muestra el resumen con total y envío; *SÍ* crea el pedido. Si el
  pago es en línea, además se envía un **link de checkout** (ver §5c).

Comandos globales en cualquier momento: `menú`, `carrito`, `finalizar`,
`cancelar`, `ayuda`.

## 5. Pedido creado

- `source = "WHATSAPP"`, `orderNumber = "WA-XXXXXX"`, `status = PENDING`,
  `paymentStatus = PENDING`.
- Precios revalidados desde la BD (nunca se confía en la sesión).
- Emite `order:new` por Socket.io a `restaurant:<id>`, `:kitchen` y, si aplica,
  a los canales de la sucursal — igual que la tienda web.

## 5b. Notificaciones de estado al cliente

Cuando el pedido cambia de estado (`PUT /api/orders/:id/status`), el cliente
recibe automáticamente un aviso por push + WhatsApp (confirmado, en preparación,
listo, en camino, entregado, cancelado). El mensaje sale con el **nombre real
del restaurante** y, si el restaurante tiene su integración `WHATSAPP`
configurada, con **su propio token**; si no, cae al token global de plataforma.

- Lógica en `services/notifications.service.js` (`notifyOrderStatus` →
  `sendOrderWhatsApp`), reutilizando la misma capa `provider` del chatbot.
- Best-effort y no bloqueante: los pedidos sin teléfono (ej. dine-in del TPV)
  se omiten silenciosamente.

## 5c. Pago en línea con link

Si el restaurante tiene una pasarela habilitada (MercadoPago o Stripe en
`IntegrationConfig`), el chatbot ofrece la opción **"Pago en línea (tarjeta)"**
en el paso de pago. Al confirmar:

1. Se crea el pedido (`paymentMethod = CARD`, `paymentStatus = PENDING`).
2. Se genera un **link de checkout** con la pasarela del restaurante
   (`services/whatsapp-bot/order.js` → `createCheckoutLink`, reutilizando
   `lib/payment-providers`) y se envía por WhatsApp.
3. El pago se confirma de forma asíncrona vía el **webhook público ya existente**
   `POST /api/store/webhook/<provider>`, que pone el pedido en `PAID/CONFIRMED`
   y dispara la notificación a cocina.

La opción solo se muestra cuando hay pasarela; si la generación del link falla,
el bot ofrece pagar en efectivo como respaldo.

## 5d. CRM de clientes + remarketing

Cada pedido por el chatbot registra/actualiza un `WhatsappContact`
(`services/whatsapp-bot/contacts.js`): teléfono, nombre, nº de pedidos, total
gastado, último pedido y consentimiento (`optIn`).

El dueño puede enviar **campañas** segmentadas
(`services/remarketing.service.js`):

- Segmentos: `ALL`, `INACTIVE` (sin pedir en 30 días), `RECENT` (últimos 7 días),
  `FREQUENT` (3+ pedidos).
- Personalización: `{nombre}` en el mensaje se reemplaza por el nombre del
  contacto. Se respeta `optIn` y se registra `lastContactedAt`. Envío con
  throttle para no saturar la API.

## 5e. Juegos promocionales

"Ruleta de premios" configurable (`services/promo-games.service.js`):

- El dueño define premios con **peso** (probabilidad) y tipo (`PERCENTAGE`,
  `FIXED` o `NONE` = "sigue participando"), límite de jugadas por número y
  disparador (`ON_COMMAND` o `ON_ORDER`).
- El cliente juega escribiendo *premio* (o automáticamente al cerrar un pedido).
  Si gana, se emite un **Coupon real** (mismo sistema de cupones) y se le manda
  el código por WhatsApp.

## 5f. Reportes del canal WhatsApp

`GET /api/whatsapp/marketing/reports?from=&to=` devuelve ventas del canal
WhatsApp (ingresos, pedidos, ticket promedio, envíos) **por sucursal** y una
comparativa **por fuente** (WhatsApp vs. otros canales).

## 5g. NLU opcional (Groq)

Con `WHATSAPP_NLU_ENABLED=true`, cuando el cliente escribe en lenguaje libre
("quiero 2 hamburguesas y un refresco") en el paso del menú, el bot usa Groq
(Llama 3.1, vía `services/whatsapp-bot/nlu.js`) para mapearlo a productos y
agregarlos al carrito. Es best-effort: sin API key o ante error, el flujo
numerado determinista sigue funcionando.

## Endpoints de administración (`/api/whatsapp/marketing`, admin)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/contacts` | Base de clientes + stats |
| GET | `/segments` | Segmentos disponibles |
| POST | `/campaigns` | Enviar remarketing `{ segment, message, limit }` |
| GET | `/games` | Listar juegos promocionales |
| POST | `/games` | Crear/actualizar juego |
| DELETE | `/games/:id` | Eliminar juego |
| GET | `/reports` | Reportes del canal WhatsApp |

## 6. Variables de entorno

| Variable | Uso |
|---|---|
| `WHATSAPP_TOKEN` | Token de plataforma (fallback de envío) |
| `WHATSAPP_API_URL` | Override del endpoint Whapi (default `gate.whapi.cloud`) |
| `WHATSAPP_VERIFY_TOKEN` | Verify token de plataforma para Meta (fallback) |
| `WHATSAPP_SESSION_TTL_MS` | Vida de sesión inactiva (default 6 h) |
| `WHATSAPP_NLU_ENABLED` | `true` para activar NLU con Groq (default off) |
| `GROQ_API_KEY` | Key de plataforma para NLU (fallback durante trial) |
| `AI_ENCRYPTION_KEY` | Para descifrar tokens guardados cifrados |
| `BACKEND_URL` / `FRONTEND_URL` | Para construir las URLs del checkout en línea |

## 7. Tests

```
pnpm --filter @mrtpvrest/backend exec jest whatsapp-bot
```

- `whatsapp-bot.engine.test.js` — flujos completos (delivery, pickup, distancia,
  pago en línea, juegos, NLU, cancelar, mínimo de compra, menú vacío).
- `whatsapp-bot.helpers.test.js` — selección numerada, normalización de
  entrada (Whapi/Meta) y cálculo de envío.
- `whatsapp-marketing.test.js` — selección de premios por peso y segmentación.
- `notifications.whatsapp.test.js` — enrutamiento de notificaciones por tenant.

## 8. Estado del roadmap

- ✅ Webhook + flujo conversacional de pedidos (delivery + pickup).
- ✅ Notificaciones de estado al cliente por WhatsApp (§5b).
- ✅ Pago en línea con link de checkout (§5c).
- ✅ Base de clientes + remarketing (§5d).
- ✅ Juegos promocionales (§5e).
- ✅ Reportes del canal WhatsApp por sucursal (§5f).
- ✅ NLU opcional con Groq (§5g).

Ideas futuras: panel de UI en el admin para configurar juegos/campañas,
programación de campañas (envíos diferidos) y soporte de SMS además de WhatsApp.
