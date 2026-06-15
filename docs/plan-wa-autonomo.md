# Plan: Pipeline autónomo WhatsApp → TPV

**Objetivo (visión del usuario):** que un agente tome el pedido completo desde WhatsApp
— saludar al cliente, tomar el pedido y sus datos — y lo dirija al TPV **solo para
imprimirlo y asignarle repartidor**, con la mínima intervención humana.

**Conclusión de la auditoría (2026-06-14):** la visión ya está construida al ~90%.
El pipeline completo existe y funciona end-to-end con **un (1) clic humano**. Este plan
cierra ese último eslabón y reconcilia una duplicación reciente.

---

## 1. Estado actual — lo que YA existe (verificado en código)

```
Cliente (WhatsApp)
   ↓  Agente nativo de WhatsApp Business (IA de Meta) — YA conversa: saluda, manda
      menú, pregunta tipo/dirección, y emite un BLOQUE ESTRUCTURADO de pedido.
   ↓  apps/wa-chrome (extensión MV3, solo-lectura) — lee el chat abierto, detecta el
      bloque (parseOrderBlock: keyword "PEDIDO LISTO" + Tipo/Dirección/Tel), arma el
      pedido. Watcher cada 7s resalta chats no leídos con pinta de pedido.
   ↓  POST /api/store/parse-order?r=slug — IA BYOK (Groq 70b, order-dictation.service):
      buildMenuList con variantes+modificadores+complementos → resolveSelections mapea
      a IDs reales, auto-selecciona variante única, marca needsReview si falta un grupo
      OBLIGATORIO (ej. "Sabores" de alitas).
   ↓  POST /api/store/orders?r=slug  (source=WHATSAPP) → nace PENDING, con fallback de
      locationId a la sucursal activa (si null, el pedido era invisible — ya arreglado).
   ↓  TPV: panel "Pedidos Web" (WebOrdersPanel) — el cajero ACEPTA (PENDING→CONFIRMED
      vía PUT /api/orders/{id}/status). useNotifications.onOrderNew AUTO-IMPRIME a KDS
      por printerGroups y notifica (socket room restaurant:{id}:location:{loc}:admins).
   ↓  Repartidor: DeliveryAssignModal → PUT /api/delivery/assign {orderId, driverId}
      → status ON_THE_WAY, notifica al driver.
```

**Componentes (todos presentes y probados):**
- `packages/wa-orders/` — motor puro Node ESM: `fetchMenu`, `parseOrder` (heurístico IDF+typos
  **+** 3 capas IA con fallback), `createDraftOrder` (→ /api/store/orders, source=WHATSAPP). CLI.
- `apps/wa-mcp/` — servidor MCP (stdio JSON-RPC, sin deps): tools `wa_menu`,
  `wa_preview_order`, `wa_create_order`. **Este es el "MCP que toma pedidos" que imaginaste.**
- `apps/wa-chrome/` — extensión: lectura DOM, protocolo de bloque estructurado, watcher de
  no-leídos, panel con edición + crear, config multi-restaurante (slug en popup). Guía para
  configurar el agente de Meta: `apps/wa-chrome/AGENTE-PEDIDOS.md`.
- Backend: `parse-order` (IA BYOK) + `store/orders` (source=WHATSAPP, PENDING) verificados.
- TPV: panel Pedidos Web + aceptar + auto-print + asignar repartidor, todo existente.

---

## 2. La duplicación a reconciliar (deuda creada hoy)

Hoy (2026-06-14) se construyó `apps/tpv/src/app/pos/whatsapp/page.tsx` — una pantalla de
captura **manual** (pegar el chat → parser **local** sin IA → `POST /api/orders/tpv`).

Diverge del sistema `wa-*` en lo importante:

| | `/pos/whatsapp` (hoy) | sistema `wa-*` (existente) |
|---|---|---|
| Endpoint | `/api/orders/tpv` | `/api/store/orders` |
| `source` | forzado `TPV` | `WHATSAPP` |
| Estado inicial | cuenta abierta directa | **PENDING** (panel Pedidos Web) |
| Badge WEB / auto-print | ❌ no | ✅ sí |
| Parser | local (sin IA) | **IA BYOK** (variantes/modificadores) |
| Flujo aceptar | ninguno | cajero ACEPTA → cocina |

**Decisión recomendada:** reposicionar `/pos/whatsapp` como **captura manual de respaldo**
(cuando el agente/extensión no corran) pero **enrutarla por `/api/store/orders`** (source=
WHATSAPP) para que herede badge WEB + PENDING + auto-print. Su parser local queda como
ayuda offline; el botón "Crear" pega al mismo camino que el resto. Así NO hay dos verdades.

---

## 3. Decisiones arquitectónicas (las que son de negocio, no de código)

### 3.1 Transporte de WhatsApp
- **Hoy:** agente nativo de WhatsApp Business (IA de Meta) conversa + emite bloque; la
  extensión **solo lee** (no envía) → riesgo de baneo ~nulo. **Recomendado mantenerlo.**
- **Alternativa (futuro/escala):** WhatsApp **Cloud API oficial** — totalmente programable
  (el bot envía y recibe), pero cobra por conversación y requiere número/verificación Meta.
  Sólo si creces a varios negocios o quieres control total del guion.

### 3.2 Modelo de confianza (clave para "autónomo")
Hoy ya cazamos errores de mapeo (kilo vs orden, KFC vs Angus). Por eso:
- **Fase inicial (recomendada):** mantener el paso **"Aceptar" de 1 toque** en Pedidos Web.
  El bot crea el PENDING automáticamente; el cajero da un toque para mandar a cocina
  (o "Corregir" si el mapeo falló). Esto **ya quita el 95% del trabajo** sin arriesgar el sartén.
- **Fase madura:** auto-aceptar cuando `needsReview=false` y confianza alta (variantes/sabores
  resueltos). Los `needsReview=true` siempre paran para revisión humana.

---

## 4. Plan por fases

### Fase A — Reconciliar y consolidar (rápido, sin riesgo)
- [ ] Reapuntar `/pos/whatsapp` a `POST /api/store/orders` (source=WHATSAPP) en vez de
      `/api/orders/tpv`. Hereda badge WEB + PENDING + auto-print.
- [ ] Reusar el `parse-order` IA del backend como opción "Detectar (IA)" en la pantalla,
      dejando el parser local como fallback offline.
- [ ] Documentar que `wa-chrome` es el camino automático y `/pos/whatsapp` el manual.
- **Resultado:** una sola tubería de creación; la pantalla manual deja de divergir.

### Fase B — Quitar el clic (auto-create en la extensión)
- [ ] En `wa-chrome`: cuando el watcher detecta un chat con **bloque estructurado**
      (`PEDIDO LISTO`), auto-llamar `parse` → si `needsReview=false` y confianza alta,
      auto-llamar `create`. Detrás de un **toggle "Modo automático"** (default OFF).
- [ ] `needsReview=true` o baja confianza → NO auto-crea: resalta para revisión.
- [ ] Registrar en el panel un log de "creados automáticamente" para auditoría.
- **Resultado:** el pedido aparece solo en Pedidos Web; el cajero solo "Acepta" (o ni eso, ver Fase D).

### Fase C — Configurar/robustecer el agente de Meta (precisión ~100%)
- [ ] Afinar el prompt del agente nativo (guía `AGENTE-PEDIDOS.md`) para que SIEMPRE cierre
      con el bloque `PEDIDO LISTO` + `Tipo/Dirección/Tel`. Es lo que da precisión ~100%.
- [ ] Regla de menú: marcas → genérico (ya existe: "coca" → Refrescos 600ml). Extender a
      "orden vs kilo" (alitas = orden salvo que diga kilo — ya lo metimos en wa-parse local;
      replicar la regla en el system prompt de `order-dictation.service`).

### Fase D — Repartidor (semi → auto)
- [ ] Corto plazo: el repartidor se asigna a 1 toque en el TPV (ya existe DeliveryAssignModal).
- [ ] Medio plazo (opcional): auto-asignación por reglas (round-robin / repartidor con menos
      pedidos activos / por zona) al aceptar el pedido. Endpoint `PUT /api/delivery/assign` ya existe.

### Fase E — Confirmación al cliente (opcional, requiere enviar)
- [ ] Si se quiere que el cliente reciba "Pedido #123 confirmado, llega en ~X": requiere
      ENVIAR mensaje. Con el agente nativo de Meta lo puede hacer la propia IA al cerrar.
      Con Cloud API, el backend lo manda. (No hacer envío masivo desde Baileys → baneo.)

### Fase F — Operación y robustez
- [ ] La pestaña de web.whatsapp.com debe seguir abierta y la extensión corriendo (es el
      "runtime" del bot read-only). Documentar setup en la tablet/PC de caja.
- [ ] Monitoreo: contador de pedidos WhatsApp creados/aceptados/corregidos por día.
- [ ] Fallback: si la extensión cae, `/pos/whatsapp` (manual) y el CLI de `wa-orders` siguen.

---

## 5. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Mapeo de productos equivocado (kilo/orden, marca/genérico) | `needsReview` + paso Aceptar humano en Fase inicial; reglas en el prompt; quedarse manual hasta tener datos. |
| Baneo de WhatsApp | Mantener **solo-lectura** (extensión) + agente nativo de Meta; no envío masivo. |
| Pedido invisible en TPV (locationId null) | Ya arreglado (fallback a sucursal activa). No regresionar. |
| Key IA vencida (GROQ_API_KEY plataforma) | BYOK: key Groq por restaurante cifrada en `Restaurant.aiApiKey`. |
| Pestaña de WhatsApp cerrada / extensión caída | Fallback manual `/pos/whatsapp` + CLI. Monitoreo. |

---

## 6. Primer milestone propuesto (1 entregable, alto valor, bajo riesgo)

**"Auto-create con red de seguridad":** Fase A (reconciliar `/pos/whatsapp`) + Fase B
(toggle de modo automático en `wa-chrome`, sólo cuando `needsReview=false`). Resultado
medible: el pedido de un cliente con bloque estructurado **aparece solo en Pedidos Web**;
el cajero da **un toque "Aceptar"** y se imprime + queda listo para repartidor. Cero captura
manual en el 95% de los casos, sin arriesgar pedidos mal mapeados a cocina.

---

## Apéndice — datos clave
- slug tienda: `master-burguer-s`; restaurantId `cmp53hjwh00061qo7vx9usdfn`; locationId
  `cmp53hk1l00081qo7gqdsxjsb` (1 sola sucursal: Principal).
- IA: BYOK Groq por restaurante (AES-GCM, `AI_ENCRYPTION_KEY`); modelo `llama-3.3-70b-versatile`.
- `source` válidos en /api/store/orders: `ONLINE`, `KIOSK`, `WHATSAPP`.
- Probar IA real sin exponer key: `railway run node apps/backend/_test_ai.cjs`.
- CLI: `node packages/wa-orders/src/cli.js "2 alitas bbq" --send --type DELIVERY ...`
