# saas-sales-mcp — Bot de ventas del SaaS, con Claude de cerebro

MCP para que **Claude atienda las conversaciones de venta del SaaS por WhatsApp**.
La inteligencia eres tú (Claude): este proyecto **no llama a Gemini ni Groq**. Solo
te da las manos: leer la bandeja, leer un chat, responder, y llevar un pipeline de
leads. Tú decides qué contestar.

## Arquitectura (dos procesos, a propósito)

```
saas-sales-worker (worker.js)         ← proceso PERSISTENTE, déjalo corriendo
  · whatsapp-web.js (LocalAuth, QR)     mantiene viva la sesión del número de ventas
  · HTTP solo en 127.0.0.1              /status /qr /queue /chat/:id /send
        ▲
        │ HTTP local
saas-sales-mcp (mcp.js)               ← lo lanza Claude (stdio) por sesión
  · tools: wa_status wa_inbox wa_read wa_send
  · tools: lead_stages lead_list lead_get lead_save   (CRM en data/leads.json)
```

Se separan porque si la sesión de WhatsApp viviera dentro del MCP, se
**reconectaría cada vez que abres Claude** — y reconectar seguido dispara el
anti-abuso de Meta (ya restringió el número antes). El worker vive aparte y
sobrevive tus sesiones.

## Requisitos
- Node ≥ 20.
- Un **número de WhatsApp dedicado a ventas** (recomendado). No uses el mismo del
  bot de pedidos ni tu personal. Si ese número tiene activada la función nativa
  *"Respuestas de la IA"* de WhatsApp Business, **apágala** (chocaría con Claude).

## Instalación
```bash
cd tools/saas-sales-mcp
npm install
cp .env.example .env   # opcional, ajusta si quieres
```

## 1) Arranca el worker y vincula el número (una sola vez)
```bash
npm run worker
```
Sale un **QR en la terminal**: escanéalo desde el número de ventas
(WhatsApp → Dispositivos vinculados → Vincular dispositivo). Al conectar verás
`✅ Conectado y listo`. **Deja este proceso corriendo siempre** (es el que
mantiene la sesión). La sesión queda en `.wwebjs_auth/` (NO se commitea).

> Si el QR de la terminal se ve mal, abre `http://127.0.0.1:8790/qr` para obtener
> el string y renderizarlo tú.

## 2) Registra el MCP en Claude
Ya quedó una entrada en el `.mcp.json` del repo:
```json
{
  "mcpServers": {
    "saas-sales": {
      "type": "stdio",
      "command": "node",
      "args": ["tools/saas-sales-mcp/mcp.js"]
    }
  }
}
```
Reinicia Claude Code (o vuelve a abrir la sesión) y aprueba el servidor. Sus
tools aparecerán como `mcp__saas-sales__*`.

## 3) Úsalo
Con el worker conectado, dile a Claude cosas como:
- **"Revisa la bandeja de ventas y contéstame quién está esperando respuesta."**
  → Claude usa `wa_inbox`, `wa_read`, redacta y manda con `wa_send`.
- **"Atiende el chat de Pixi Dixi y muévelo a DEMO."** → `wa_read` + `wa_send` +
  `lead_save`.
- Para atención continua sin pedírselo cada vez, usa `/loop` (p. ej. cada 3-5 min:
  "revisa la bandeja de ventas y responde lo pendiente"). El worker sigue vivo
  entre corridas.

## Herramientas
**Mensajería + pipeline (v1, funcionan solo con el worker):**
| Tool | Qué hace |
|---|---|
| `wa_status` | Conexión / QR pendiente. |
| `wa_inbox` | Conversaciones con mensajes sin responder (tu cola de trabajo). |
| `wa_read` | Historial de un chat (contexto antes de responder). |
| `wa_send` | Envía tu respuesta (solo-responder; bloquea duplicados). |
| `lead_stages` | Etapas válidas del pipeline. |
| `lead_list` | Leads por etapa. |
| `lead_get` | Ficha de un lead. |
| `lead_save` | Mueve de etapa / guarda datos / agrega nota. |

**Acciones del SaaS (v2, requieren backend + `MRTPV_SALES_BOT_TOKEN`):**
| Tool | Qué hace |
|---|---|
| `saas_founders_status` | Lugares de fundador restantes + días de trial (urgencia). |
| `saas_demo_link` | Link de la tienda demo para el flujo en vivo. |
| `saas_create_tenant` | **Cierra la venta**: crea la cuenta (tenant+trial+restaurante+sucursal+admin+PIN 1234), activa la promo, devuelve credenciales + link de tienda. |
| `saas_seed_menu` | Siembra el menú de ejemplo capturado en la charla. |
| `saas_tenant_status` | Estado de un tenant (trial, email, tienda) para seguimiento/soporte. |

Pipeline: `NUEVO → CALIFICANDO → DEMO → ONBOARDING → ACTIVADO → SOPORTE`
(`+ DESCARTADO`).

### Ciclo completo que habilita
1. **CALIFICANDO** — `wa_inbox`/`wa_read`, tú preguntas rubro y dolor, `lead_save`.
2. **DEMO** — `saas_demo_link`, `saas_founders_status` (urgencia), agendas.
3. **ONBOARDING** — capturas negocio, dueño, email y menú en la charla.
4. **ACTIVADO** — `saas_create_tenant` (→ credenciales + link tienda) + `saas_seed_menu`; le mandas por WhatsApp su acceso.
5. **SOPORTE** — `saas_tenant_status` para dar seguimiento.

## Reglas de seguridad (anti-baneo) — no las rompas
- **Solo-responder**: contesta a quien te escribe. Nada de mensajes en frío ni
  masivos (riesgo de baneo + ley de datos).
- No redeployes/reinicies el worker en ráfaga; cada re-vinculación cuenta para el
  anti-abuso de Meta.
- El worker escucha **solo en 127.0.0.1** — no lo expongas a internet.
- Nunca subas `.wwebjs_auth/` (repo público = takeover). Ya está en `.gitignore`.

## Backend requerido para la v2
Los tools `saas_*` pegan a `/api/sales-bot/*` en el backend MRTPV, autenticados
con un **token de plataforma**. Para habilitarlos:

1. **Genera el token** (una vez):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Backend** (Railway, servicio `mrtpvrest`): setea `SALES_BOT_TOKEN=<ese token>`.
   Opcionales: `STOREFRONT_BASE` (default `mrtpvrest.com`), `SALES_DEMO_STORE_URL`
   (default la tienda de Master Burguer's).
3. **MCP** (`.env` de esta carpeta): `MRTPV_SALES_BOT_TOKEN=<el MISMO token>` y, si
   pruebas en local, `MRTPV_API_BASE=http://localhost:3001`.

Sin `SALES_BOT_TOKEN` el backend responde 503 a `/api/sales-bot/*` (falla cerrado).
La mensajería (v1) NO depende de esto.

### Código de la v2 (referencia)
- `apps/backend/src/lib/tenant-provision.js` — `provisionTenant` (espejo del alta
  de `auth.routes.js`) + `seedSampleMenu`.
- `apps/backend/src/routes/sales-bot.routes.js` — endpoints, montado en
  `index.js` como `/api/sales-bot` (antes de `tenantMiddleware`).

> Nota de deuda: `provisionTenant` **replica** el alta del registro self-serve
> (`auth.routes.js`). Si cambias uno, refleja el otro (o unifícalos con su suite
> de integración).
