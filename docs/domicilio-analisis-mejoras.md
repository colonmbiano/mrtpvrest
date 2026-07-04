# Domicilio (Master Burguer's) — Análisis real + plan de mejora

Análisis del sistema de pedidos a domicilio basado en la **lectura de ~10
conversaciones reales** del último mes (WhatsApp del restaurante, vía whatsapp-mcp)
+ el conocimiento del sistema (bot Cajero Estrella, `/api/store/orders`, app de
reparto, caja de repartidor). Fecha: 2026-07-03.

> Metodología: se vinculó el whatsapp-mcp al número del restaurante (72933566220)
> como dispositivo de solo-lectura y se leyeron conversaciones reales de junio-julio.
> No se envió ningún mensaje.

---

## 1. Cómo funciona HOY el domicilio (extremo a extremo)

**Toma de pedido — dos vías en paralelo:**
- **Humano (dueño/staff):** para conocidos y regulares. Mandan **fotos del menú**
  (4 imágenes), negocian por **audio**, trato corto y casual. Cierran con
  transferencia (cuenta STP Mercado Pago) + comprobante.
- **Bot (Cajero Estrella):** saluda + empuja la tienda en línea → toma los
  productos → pide nombre + domicilio/recoger + dirección + ubicación GPS + método
  de pago → confirma con total + envío. Crea la orden en el TPV (`source=WHATSAPP`).

**Cálculo de envío:** server-side por distancia (Haversine) SI el cliente manda
ubicación GPS. En la práctica **casi nadie la manda** → el envío real depende de
que el staff conozca la zona.

**Entrega:** el repartidor se asigna internamente (TPV/app). El cliente **NO recibe
avisos automáticos**; el estatus ("va en camino", tiempo) lo responde el staff **a
mano** cada vez que el cliente pregunta.

**Pago:** efectivo (con cambio) o transferencia + comprobante (lo más común).

---

## 2. Hallazgos de los chats reales

1. **La gente pide CASUAL y con errores de dedo.** *"tienes hamburguesas toda vida
   bro"*, *"tiene servixio"*, *"yendra papas gaho"*, *"promos ya no?"*. Preguntan
   disponibilidad ANTES de pedir.
2. **Las direcciones son REFERENCIAS, no direcciones ni GPS.** *"Frente al billar
   del gato"*, *"a un lado del mercado"*, *"en el Canalito"*, *"Panadería El
   Chaparro"*. Casi nadie comparte ubicación de WhatsApp.
3. **Mucho audio** (piden y aclaran por notas de voz — el bot ya transcribe, bien).
4. **Piden "el menú" y esperan FOTOS** (así lo mandan los humanos), no texto.
5. **Pago:** transferencia + comprobante domina; efectivo suele ser *"billete de
   $200"* → **necesita cambio**.
6. **Ansiedad por el tiempo:** preguntan seguido *"¿ya salió?"*, *"¿aún tardan?"*,
   *"¿ya vendrán?"*, *"me avisas cuando lleguen"*. Todo se responde a mano.
7. **Ocurren errores de pedido** (llegó algo distinto a lo pedido) → la queja entra
   por WhatsApp.

---

## 3. Problemas concretos (con evidencia)

| # | Problema | Impacto | Evidencia |
|---|---|---|---|
| 1 | Bot **repite/loopea** el bloque "confírmame nombre, DELIVERY/TAKEOUT, pago" 3-4 veces | Alto (molesta, se ve robótico) | chat 5217228471191 |
| 2 | **"(DELIVERY)"/"(TAKEOUT)"** en inglés y mayúsculas | Medio (confuso) | varios |
| 3 | **Saludo duplicado** (2 mensajes de golpe) | Medio | "Ari" 22:06 |
| 4 | **Disculpa duplicada 3 veces** en una queja | Medio | "Ari" 23:49-23:54 |
| 5 | **Confirma sin preguntar pago** a veces | Medio (caja) | "Ari" |
| 6 | **Menú como texto largo con IDs** en vez de fotos | Alto (fricción, no encaja con el hábito) | varios |
| 7 | Cliente **no manda GPS** → envío no se calcula bien | Alto (dinero) | mayoría |
| 8 | **Sin avisos de entrega** → el cliente pregunta y el staff responde a mano | Alto (carga operativa) | 5217223674274, 5217224060356, 5217227902587… |
| 9 | **Quejas:** el bot solo se disculpa + "abrimos mañana", sin resolver ni escalar | Alto (retención) | "Ari": *"los pedí de longaniza"* |

---

## 4. Mejoras propuestas (priorizadas)

### 🟢 Rápidas — instrucciones del bot (sin deploy) — **YA APLICADAS (2026-07-03)**
En las instrucciones del panel (`IntegrationConfig`, sección DOMICILIO):
- Nada de "(DELIVERY)/(TAKEOUT)" → español natural ("¿a domicilio o pasas por él?").
- **Una pregunta a la vez, corto y casual**; no repetir el bloque de confirmación.
- **Aceptar direcciones por referencia**; pedir ubicación GPS UNA vez, sin insistir.
- **No confirmar sin pago**; en domicilio asumir efectivo y preguntar con cuánto paga.
- **Saludar una vez**; dar SIEMPRE un tiempo estimado al confirmar.
- (Anti-loop + regla de salsas por categoría ya estaban puestas antes.)

### 🟡 Medianas (requieren build)
- **Menú como FOTOS**: cuando pidan "el menú", que el bot mande las imágenes (como
  el staff), no el texto con IDs. Encaja con cómo YA pide la gente.
- **Avisos de entrega automáticos**: "tu pedido va en camino (~15 min)" cuando el
  repartidor se asigna en el TPV/app. Mata la pregunta *"¿ya salió?"* repetida.
- **Ocultar IDs del menú** en el texto (bug: se filtran "ID: cmpp…").

### 🔴 Grandes (más trabajo, más valor)
- **Envío por ZONAS/colonias** (tabla de tarifas por referencia) en vez de solo GPS
  por distancia — porque la gente no manda ubicación. El bot pregunta la colonia y
  cobra la tarifa de la zona.
- **Flujo de quejas**: el bot detecta una queja, busca el pedido del cliente,
  ofrece una solución (reposición/cupón) y escala a un humano con contexto — en vez
  de solo "abrimos mañana".
- **Captura de ubicación más efectiva**: guardar la referencia como dato del cliente
  para próximos pedidos (no volver a pedir dirección a un cliente recurrente).

---

## 5. Roadmap sugerido

1. **Ya hecho:** afinación de instrucciones del bot (natural, sin loops, sin inglés,
   acepta referencias, pide pago, da tiempo estimado, salsas por categoría).
2. **Siguiente (mediano):** menú como fotos + ocultar IDs + avisos de entrega auto.
3. **Después (grande):** envío por zonas + flujo de quejas + memoria de dirección
   por cliente recurrente.

Nota transversal: **el bot debe SONAR como el staff** (corto, cálido, casual, con
fotos y tiempos), porque así es como tu gente ya está acostumbrada a pedir.
