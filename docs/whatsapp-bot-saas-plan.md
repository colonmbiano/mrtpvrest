# Bot de WhatsApp como producto para tenants (Cajero Estrella SaaS)

Plan de arquitectura, reglas de uso/anti-baneo y guía de la vía oficial (WhatsApp
Cloud API). Objetivo: ofrecer el asistente de WhatsApp que ya corre para Master
Burguer's como **add-on de pago** a los tenants de la plataforma.

> Contexto técnico previo: `docs/whatsapp-bot-hosting.md` (runbook de UNA instancia).
> El código del bot ya es multi-tenant (carga menú/horario/precios/negocio de la BD
> por `WHATSAPP_BOT_RESTAURANT_ID`) y la página del admin (`/admin/whatsapp` →
> pestaña "Asistente IA") ya controla la config por-tenant (IntegrationConfig
> `WHATSAPP_ASSISTANT`).

---

## 0. Recomendación (TL;DR)

1. **Empieza lean.** No construyas el orquestador de sesiones todavía. Haz la
   **Fase 1** (conexión por-tenant con QR self-service en el admin, provisión
   semi-manual) y consigue **3-5 tenants que paguen**. Valida demanda antes de
   invertir semanas en la parte pesada.
2. **Ofrece DOS modalidades y deja que el cliente elija sabiendo el riesgo:**
   - **Estándar (whatsapp-web.js):** su número normal, sin Meta, fácil de conectar
     (escanea un QR). **Riesgo real de baneo** (es no oficial). Barato de empezar.
   - **Oficial (WhatsApp Cloud API):** sin riesgo de baneo, escalable, robusto —
     pero el número se registra en Meta (queda **solo-API**, ya no se usa en la app
     normal) y tiene costo por conversación. Ideal para clientes serios/grandes.
3. **Cobra el add-on** atado a la suscripción y que el **precio cubra la infra**
   (cada sesión estándar corre un Chromium ≈ 300-500 MB de RAM).
4. **Haz firmar al cliente un aviso de riesgo** (ver §6) si elige la modalidad
   estándar. Es un producto sobre una API no oficial: transparencia = menos
   reclamos.

---

## 1. Por qué "el bot" ya no es lo difícil

Lo que YA está resuelto:
- ✅ **Código multi-tenant.** Nada hardcodeado de un negocio; todo sale de la BD por
  `WHATSAPP_BOT_RESTAURANT_ID`.
- ✅ **Panel de control por-tenant.** Cada dueño ajusta instrucciones, pausa,
  ignorados, y ve métricas y estado en vivo desde su propio admin.
- ✅ **Gating por-tenant.** `IntegrationConfig` type `WHATSAPP_ASSISTANT`.
- ✅ **Creación de pedidos multi-tenant** vía la API del backend (`/api/store/orders`).

Lo que FALTA para volverlo producto:
1. **Orquestar N sesiones** (una por número de tenant).
2. **Onboarding self-service** (el tenant conecta su WhatsApp solo, con un QR).
3. **Cobro + gating por suscripción.**

---

## 2. Restricción fundamental (léela antes que nada)

**whatsapp-web.js vincula el bot como "dispositivo companion" a UN número real.**
Consecuencia: **1 número = 1 sesión = 1 proceso con su Chromium y su volumen.**

- No caben 85 sesiones en un contenedor (RAM). Realista: **3-8 sesiones por worker**.
- 85 tenants ⇒ ~11-30 workers. Eso es un **fleet**, no un servicio.
- Cada sesión persiste en un volumen (para no re-escanear QR en cada deploy).

Esta restricción es la que motiva TODO el diseño de abajo. La única forma de
quitarla es Meta Cloud API (§5), que cambia el trade-off de riesgo.

---

## 3. Arquitectura objetivo (Fase 2 en adelante)

```
                         ┌───────────────────────────────┐
   Admin del tenant ───▶ │  Backend (api.mrtpvrest.com)  │
   (conectar / pausar /  │  - Control plane del bot      │
    ver QR / métricas)   │  - Tabla BotSession           │
                         │  - Provisiona / asigna worker │
                         └───────────────┬───────────────┘
                                         │ (asignación + comandos)
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
       ┌────────────┐            ┌────────────┐             ┌────────────┐
       │  Worker A  │            │  Worker B  │     ...     │  Worker N  │
       │ 3-8 sesio- │            │ 3-8 sesio- │             │            │
       │ nes wweb   │            │ nes wweb   │             │            │
       │ (Chromium) │            │            │             │            │
       └─────┬──────┘            └─────┬──────┘             └────────────┘
             │ volumen /data           │ volumen /data
       (session-<tenant>)        (session-<tenant>)
```

**Piezas nuevas:**

- **Tabla `BotSession`** (nueva, en el schema): `{ id, restaurantId, phoneNumber,
  status(PENDING_QR|CONNECTING|READY|LOST|DISABLED), workerId, sessionPath,
  lastReadyAt, lastQrAt, createdAt }`. Es la fuente de verdad del fleet.
- **Control plane** (en el backend): endpoints para crear/pausar/reasignar sesiones
  y para que el admin del tenant obtenga el **QR de SU sesión** y su estado.
- **Worker multi-sesión**: refactor de `client.js` para instanciar **N clientes**
  whatsapp-web.js en un proceso (cada uno con su `clientId`/carpeta de sesión y su
  `restaurantId` fijado), en vez de uno solo con `clientId="mrtpvrest-bot"`.
- **Asignador/balanceador**: al alta de una sesión, se asigna al worker con cupo.
  Al arrancar, cada worker levanta las sesiones que le tocan (de `BotSession`).
- **Recuperación**: si una sesión pasa a LOST, alerta al tenant (correo/panel) y
  ofrece re-escanear QR. Ya existe la base (`notifyAlert`, `/livez`, bot-alert).

---

## 4. Roadmap por fases

### Fase 1 — Validar con los primeros que paguen (semilla)
Meta: vender YA a 3-5 tenants sin construir el orquestador.
- **QR + estado POR-TENANT en el admin.** Hoy el admin lee un `WHATSAPP_BOT_STATUS_URL`
  global; guardarlo **por-tenant** en su `IntegrationConfig` (o en `BotSession`),
  para que cada admin vea el QR/estado de SU bot.
- **Provisión semi-manual**: por cada tenant nuevo se crea un servicio Railway
  (script/plantilla del runbook) y se pega su status URL en su config.
- **Gate**: mostrar la pestaña "Asistente IA" solo si el add-on está activo.

### Fase 2 — Orquestador (la parte de escala)
- Tabla `BotSession` + control plane.
- Worker multi-sesión (N clientes por contenedor).
- Auto-provisión al escanear QR + balanceo + auto-recuperación + alertas.

### Fase 3 — Producto
- Add-on en el billing (SKU/suscripción), precio que cubra infra.
- Métricas de uso por tenant (el servicio de métricas ya existe).
- Guardrails anti-baneo aplicados por defecto (§5) + aviso de riesgo firmado (§6).

---

## 5. Reglas de uso y anti-baneo ⚠️ (CRÍTICO)

WhatsApp **prohíbe** el uso automatizado no autorizado (whatsapp-web.js NO es
oficial). Los baneos ocurren y son **de cara al cliente** (su número deja de
funcionar). Estas reglas reducen —no eliminan— el riesgo.

### 5.1 Reglas que el SISTEMA aplica (ya implementadas / a mantener)
- **SOLO-RESPONDER.** El bot **nunca inicia** conversaciones ni manda difusiones.
  Solo contesta mensajes 1-a-1 recibidos. (Iniciar/mass-messaging es el disparador
  #1 de baneo.)
- **Rate-limit por remitente** + mutex por chat (evita ráfagas/loops).
- **Ignora** grupos, estados, difusiones y newsletters.
- **Handoff humano**: si una persona contesta desde el cel, el bot se calla.
- **Ritmo humano**: no responder en milisegundos a todo; sin spam de mensajes
  repetidos.
- **Nunca** re-confirmar/duplicar ni mandar el mismo mensaje muchas veces.

### 5.2 Reglas que el TENANT debe cumplir (comunicar y hacer aceptar)
- **NO usar el bot para campañas, promos masivas ni mensajes en frío.** Solo
  atención a clientes que ESCRIBEN primero.
- **NO importar listas ni escribir a números que no han contactado al negocio.**
- **Usar un número con reputación** (con historial de uso normal, no un chip nuevo
  recién comprado — los números nuevos se banean más fácil).
- **Mantener el teléfono encendido y con internet** (whatsapp-web.js es dispositivo
  companion; si el teléfono principal muere mucho tiempo, la sesión cae).
- **Responder quejas/soporte con humano** cuando el cliente lo pida (el handoff
  ayuda, pero el negocio debe atender).
- **No prometer lo que el bot no puede** (el bot toma pedidos y da seguimiento; no
  sustituye atención compleja).

### 5.3 Qué dispara baneos (para que el cliente entienda)
- Mensajes masivos / difusiones / primer contacto no solicitado.
- Muchos reportes de "spam" de los destinatarios (si a la gente le molesta, la
  bloquea y reporta → baneo).
- Números nuevos con actividad automatizada inmediata.
- Volumen anormal en poco tiempo.
- Contenido que viola políticas de WhatsApp (ilegal, engañoso, etc.).

### 5.4 Postura recomendada del producto
- Vender la modalidad estándar como **"asistente de atención"** (reactivo), NO como
  "herramienta de marketing masivo". Eso mantiene el uso dentro de lo defendible.
- Ofrecer la **modalidad oficial (Cloud API, §5)** a quien quiera hacer campañas o
  no tolere el riesgo de baneo.
- **Aviso de riesgo firmado** (§6) para la modalidad estándar.

---

## 6. Guía: implementación con WhatsApp Cloud API (la vía OFICIAL, sin baneo)

Esta es la alternativa que **elimina el riesgo de baneo** porque es la API oficial
de Meta. El costo: el número entra a Meta y queda **solo-API** (ya no se usa en la
app normal de WhatsApp), y se paga por conversación. Documentada aquí para que el
cliente **entienda el trade-off** y pueda elegir con conocimiento.

### 6.1 Qué es
- API oficial de Meta para enviar/recibir mensajes de WhatsApp Business de forma
  programática. Multi-tenant nativa (un webhook atiende a todos), sin Chromium, sin
  QR, sin dispositivo companion.

### 6.2 Requisitos por número/negocio
1. **Meta Business Manager** verificado (verificación de negocio de Meta).
2. **WhatsApp Business Account (WABA)** dentro del Business Manager.
3. Un **número de teléfono dedicado** que se **registra en Meta**. ⚠️ Ese número
   **deja de usarse en la app de WhatsApp** (queda solo para la API). No se puede
   tener el mismo número en la app y en Cloud API.
4. **Verificación del negocio** y aceptación de las políticas de WhatsApp Business.
5. Una app en **Meta for Developers** con el producto WhatsApp agregado.

### 6.3 Pasos de alta (resumen)
1. Crear la app en `developers.facebook.com` → agregar **WhatsApp**.
2. Conectar/crear la **WABA** y agregar el número (recibe código de verificación
   por SMS/llamada al número que se migrará a la API).
3. Obtener: **Phone Number ID**, **WABA ID**, y un **token** (temporal para
   pruebas; permanente vía System User para producción).
4. Configurar el **Webhook**: una URL pública en tu backend (p.ej.
   `POST /api/whatsapp/cloud/webhook`) + un **verify token**. Meta manda ahí los
   mensajes entrantes.
5. Suscribir la WABA a los eventos `messages`.
6. Enviar mensajes con `POST https://graph.facebook.com/v20.0/<PHONE_NUMBER_ID>/messages`
   con el token en el header `Authorization: Bearer <TOKEN>`.

### 6.4 Regla clave de Cloud API: ventana de 24h y plantillas
- Puedes responder **libre** dentro de las **24 horas** desde el último mensaje del
  cliente (justo el caso del bot: el cliente escribe, tú respondes). ✅
- Fuera de esa ventana (iniciar tú), **solo puedes mandar "plantillas" aprobadas**
  por Meta. Para un bot **reactivo** (como el nuestro) esto casi no estorba.

### 6.5 Costo
- Modelo **por conversación** (no por mensaje): se abre una "conversación" de 24h.
  Las de **servicio/atención** (cliente inicia) suelen ser gratis o baratas; las de
  **marketing/utilidad** (negocio inicia) cuestan más y varían por país. Revisar la
  tarifa vigente de Meta para México.

### 6.6 Cómo encaja en nuestro código
- El **cerebro es el mismo**: `gemini.js` (prompt, contrato JSON CONFIRMED/
  ADD_TO_ORDER/CONVERSING) y `orderProcessor.js` (crear pedido) **se reutilizan tal
  cual**.
- Cambia solo el **transporte**: en vez de `client.js` (whatsapp-web.js), un
  **adaptador Cloud API**: un webhook que recibe el mensaje → llama a
  `processWhatsAppMessage(...)` → responde con la Graph API. Sin Chromium, sin QR,
  sin volumen.
- Multi-tenant: el webhook identifica el tenant por el **Phone Number ID** que
  recibe el mensaje → mapea a `restaurantId`. Un solo servicio atiende a todos.

### 6.7 Trade-off honesto
| | whatsapp-web.js (estándar) | Cloud API (oficial) |
|---|---|---|
| ¿Usa su número normal? | **Sí** (companion) | **No** (número solo-API) |
| ¿Riesgo de baneo? | **Sí, real** | **No** (oficial) |
| ¿Necesita Meta/verificación? | No | **Sí** |
| Costo | Infra (Chromium/RAM) | Por conversación + infra baja |
| Escala | Fleet de workers | Un webhook para todos |
| Onboarding | Escanear QR | Alta en Meta (más fricción) |
| Robustez | Media (sesiones caen) | Alta |
| Ideal para | Empezar rápido, negocios chicos | Escala/serios, marketing |

---

## 7. Aviso de riesgo para el cliente (modalidad estándar)

Texto sugerido para que el tenant acepte antes de activar el bot estándar:

> **Aviso importante.** El "Asistente de WhatsApp" (modalidad estándar) opera sobre
> una tecnología **no oficial** de WhatsApp. Aunque aplicamos medidas para reducir
> el riesgo (el bot solo responde, nunca inicia ni envía mensajes masivos),
> **WhatsApp puede restringir o banear el número** si detecta actividad
> automatizada, especialmente si se usa para mensajes masivos o no solicitados.
> Usa esta función **solo para atender a clientes que te escriben primero**. No
> nos hacemos responsables por bloqueos del número impuestos por WhatsApp. Si
> necesitas garantía total, ofrecemos la modalidad **oficial (WhatsApp Cloud API)**,
> que no tiene este riesgo (requiere registrar el número en Meta).

---

## 8. Estado

- **Fase 1 — HECHA** (master `a4a9959`): conexión por-tenant (QR + estado en el
  admin) + endpoint de provisión + piloto vinculado. Ver `project_whatsapp_bot_saas`.
- **Fase 2 — diseño en §9**, pendiente de construir.

---

## 9. Diseño técnico Fase 2 — bot **API-only** + token por-tenant

Meta: (1) que el bot **nunca toque la BD directo** ni tenga secretos de la
plataforma, para poder correr el fleet más seguro **y** permitir auto-hospedaje;
(2) orquestar muchas sesiones. Todo debe construirse **aditivamente** para no
romper el bot en producción (Master Burguer's) hasta cortar a propósito.

### 9.1 El problema que resuelve
Hoy el bot importa `prisma` y necesita `DATABASE_URL` + `JWT_SECRET` +
`GOOGLE_AI_API_KEY`. Darle eso a un tenant = darle acceso a TODA la BD y poder
firmar tokens. Inaceptable. Accesos directos a BD que hay que eliminar del bot:

| Archivo | Query directo | Reemplazo API |
|---|---|---|
| `gemini.js` | `menuItem.findMany`, `restaurant.findUnique`, `restaurantConfig.findUnique` | `GET /api/bot/context` |
| `client.js` | `restaurant.findFirst` (tenant), `order.findFirst` (ticket) | `GET /api/bot/context`, `GET /api/bot/orders/:id` |
| `botConfig.js` | `integrationConfig.findUnique/create` | `GET /api/bot/config` (seed pasa al server) |
| `orderProcessor.js` | `location/employee.*` (crea empleado-bot), `order.findFirst` | server resuelve el actor por el token; `GET /api/bot/orders/:id` |

### 9.2 Token por-tenant (SIN migración)
- Al provisionar, se genera un token `bt_<restaurantId>.<secret-aleatorio>`. Se
  guarda **solo el hash** (sha256 del secret) en `IntegrationConfig.config.botTokenHash`.
  El token completo se muestra **una vez** para ponerlo en el env del bot
  (`WHATSAPP_BOT_TOKEN`).
- **Middleware `botAuth`** (`lib/bot-auth.middleware.js`): lee `Authorization: Bearer bt_<rid>.<secret>`, saca `restaurantId` del prefijo, hace `findUnique` de esa fila, compara `sha256(secret)` con `botTokenHash`. Si casa → `req.restaurantId = rid` (scope de UN tenant), `req.botAuthed = true`. O(1), sin iterar.
- **Revocable**: rotar el token (nuevo hash) invalida al bot viejo al instante.
- **Rotación**: `POST /api/admin/whatsapp-assistant/rotate-token` (super-admin) →
  devuelve el token nuevo una vez.

### 9.3 Superficie `/api/bot/*` (toda con `botAuth`)
- `GET /api/bot/context` → `{ restaurant:{name,phone,address}, config:{businessHours,estimatedDelivery,paymentMethods,openState}, menu:<string o estructurado> }`. Reúne server-side lo que hoy arma `gemini.js` (con su caché de 60s, movido al backend o con `Cache-Control`).
- `GET /api/bot/config` → `{ active, extraInstructions, ignoreNumbers, ignoreGroupName }` (la fila WHATSAPP_ASSISTANT). El **self-seed pasa al server** (o se elimina; el bot solo lee).
- `POST /api/bot/orders` → crea la orden (reusa la lógica de `/api/store/orders`), pero el **actor bot** se resuelve del token (el backend crea/usa el empleado-bot; el bot ya no llama a `getBotEmployeeId`).
- `POST /api/bot/orders/:id/items` → agrega items (reusa add-round).
- `GET /api/bot/orders/:id` → detalle con items + **modifiers + notes** (para el ticket con variantes/extras — ya lo hace `fetchOrderTicketDetail`, se mueve al server).
- `GET /api/bot/whoami` → `{ restaurantId, name }` (diagnóstico/healthcheck del token).

### 9.4 Llave de IA por-tenant (opcional, para escala/aislamiento)
- Guardar `geminiApiKey` (cifrada) en la config del tenant. `GET /api/bot/context`
  puede devolverla (o el bot self-hosted trae la suya en env). Aísla cuota y
  permite atribuir costo por tenant. Si no hay, cae a la key global.

### 9.5 Orquestador multi-sesión (necesita migración)
- **Tabla `BotSession`** (migración, agregar a `SCOPED_MODELS`): `{ id, restaurantId,
  phoneNumber, status(PENDING_QR|CONNECTING|READY|LOST|DISABLED), workerId,
  sessionPath, lastReadyAt, lastQrAt }`.
- **Worker multi-sesión**: refactor de `client.js` para instanciar **N clientes**
  whatsapp-web.js (hoy uno con `clientId="mrtpvrest-bot"`), cada uno con su
  `clientId`/carpeta y su `WHATSAPP_BOT_TOKEN`. Al arrancar, levanta las sesiones
  que le asignó el control plane.
- **Provisión/QR self-service**: al activar el add-on, el control plane crea la
  `BotSession`, la asigna a un worker con cupo, y el QR aparece en el admin (§Fase 1).
- **Recuperación**: LOST → alerta + re-QR. Ya hay base (`notifyAlert`, `/livez`).

### 9.6 Orden de construcción (seguro, sin romper prod)
1. **A — Backend aditivo**: `botAuth` + `/api/bot/*` + emisión/rotación de token.
   No toca el bot vivo. Testeable solo con curl + un token de prueba.
2. **B — Bot API-only**: nuevo cliente que usa `WHATSAPP_BOT_TOKEN` + `/api/bot/*`
   en vez de prisma. Desplegar como servicio NUEVO apuntado a un tenant de prueba.
3. **C — Cortar el piloto** a API-only y **quitar `DATABASE_URL`/`JWT_SECRET`** del
   env del bot. A partir de aquí el bot es hospedable afuera sin secretos.
4. **D — Orquestador**: `BotSession` + worker multi-sesión + auto-provisión.

Increment A es el siguiente paso.
