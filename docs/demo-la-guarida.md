# Demo — La Guarida (antojitos) · mañana 8:00 PM

Prospecto: **La Guarida**, venta de antojitos. Contacto `+52 55 XXXX XXXX`.
Dolor **en sus palabras**: *"Recibir pedidos en WhatsApp"*. Pidió una propuesta y él
mismo eligió el horario: *"Mañana / En la noche / A las 8 pm"*.

> ⚠️ **A La Guarida NUNCA se le mencionó precio.** No entres con "$699". Entra con
> los **6 meses gratis (primeros 100)**. El precio solo si él pregunta.
>
> ⚠️ El bot prometió *"te paso con alguien de mi equipo para confirmar"* y **nadie
> confirmó**. Confirma la cita ANTES, o habrá no-show.

---

## 0) Antes de la demo

### Confirmar la cita (mándalo hoy)
```
Hola, soy Eduardo de MRTPVREST 👋 Te confirmo tu demo mañana a las 8:00 PM por
videollamada aquí mismo (12 min).

Te voy a mostrar exactamente lo que pediste: cómo La Guarida recibe los pedidos
ya organizados —con producto, dirección y total— sin que anotes nada.

Y algo importante que no te comentaron: eres de los primeros 100 negocios, así
que entras con 6 meses de acceso completo gratis.

¿Te confirmo mañana 8:00 PM?
```
En el chat toca **"Responder manualmente"** para que la IA nativa de Meta deje de
contestar encima de ti (es la que soltó "$699" con Pixi Dixi y nunca mencionó los
6 meses).

### Dejar la tienda demo lista
Dos caminos. **A** es el bueno; **B** es el plan de respaldo si no alcanzas a
desplegar. Ver `#Setup` abajo.

---

## 1) Guion, minuto a minuto (12 min)

| Min | Qué haces | Qué dices |
|---|---|---|
| 0-1 | Encuadre | *"En 12 minutos te muestro cómo entra un pedido de La Guarida sin que anotes nada. Al final, si te gusta, te dejo tu cuenta lista."* |
| 1-4 | **Eres su cliente.** Compartes pantalla, abres SU tienda (con sus antojitos), pides 3 quesadillas + agua de horchata, dirección, confirmas | *"Esto es lo que ve tu cliente desde su celular."* |
| 4-7 | **El momento "wow".** Muestras el pedido ya formado: producto, dirección, total, hora | *"Este es el pedido que acabo de hacer. Nadie escribió nada. Justo lo que pediste: recibir pedidos sin perderlos."* |
| 7-9 | **El bot.** Le escribes *"quiero 2 sopes"* y el bot arma el ticket | *"Y si tú quieres meterte a contestar, el bot se calla solo."* |
| 9-11 | Lo que sigue: comanda de cocina + corte del día | *"Esto es la 'flexibilidad' que te comentaron — se prende después, sin cambiar de sistema."* |
| 11-12 | **Cierre** (abajo) | — |

### El cierre (no preguntes "¿qué te pareció?")
> *"Como eres de los **primeros 100**, te activo los **6 meses gratis** ahorita y te
> dejo tu menú de antojitos ya cargado. ¿Lo dejamos listo para que mañana recibas
> tu primer pedido real?"*

El demo **es** el onboarding: que salga de la llamada usándolo, no "pensándolo".

---

## 2) Objeciones

| Te dirá | Respondes |
|---|---|
| *"¿Cuánto cuesta?"* | *"$699 al mes acceso completo — pero tú entras con **6 meses gratis** por ser de los primeros 100. Sin tarjeta."* |
| *"No le sé a los sistemas"* | *"No instalas nada. Funciona desde tu celular, y el menú te lo cargo yo."* |
| *"Ya uso WhatsApp, ¿pa' qué?"* | *"Justo por eso. Hoy los pedidos se te pierden entre mensajes. Esto los convierte en tickets con dirección y total, en el mismo WhatsApp."* |
| *"Déjame pensarlo"* | *"Va. Te dejo la cuenta activa con tu menú cargado, sin costo. Si mañana no te sirve, no hiciste nada. ¿Te parece?"* |

---

## 3) Setup

Menú de ejemplo versionado en `tools/saas-sales-mcp/samples/menu-la-guarida.json`
(3 categorías, 14 platillos — realista sin hacer lenta la demo).

### Camino A — automático (recomendado)
Habilita que Claude cree la cuenta y siembre el menú **en vivo** durante la demo.

1. **Mergear el PR** [#126](https://github.com/colonmbiano/mrtpvrest/pull/126)
   (checks en verde). Railway redespliega el backend solo.
2. **Setear el token en Railway** (servicio `mrtpvrest`). El token ya está generado
   en `tools/saas-sales-mcp/.env`; cópialo de ahí:
   ```bash
   # Ver el token (NO lo pegues en chats ni commits)
   grep MRTPV_SALES_BOT_TOKEN tools/saas-sales-mcp/.env

   # Setearlo en Railway
   railway variables --set "SALES_BOT_TOKEN=<ese-valor>" -s mrtpvrest
   ```
3. **Verificar** que el endpoint responde (debe dar `foundersLeft` y `trialDays`):
   ```bash
   curl -H "x-sales-token: <ese-valor>" https://api.mrtpvrest.com/api/sales-bot/founders-status
   ```
   - `503` → falta `SALES_BOT_TOKEN` en el backend o no ha redesplegado.
   - `401` → el token del `.env` y el de Railway no coinciden.

Con eso, durante la demo Claude usa `saas_create_tenant` + `saas_seed_menu`.

**Endpoints (referencia):** todos con header `x-sales-token`.
| Método | Ruta | Body / query |
|---|---|---|
| GET | `/api/sales-bot/founders-status` | — |
| GET | `/api/sales-bot/demo-link` | — |
| POST | `/api/sales-bot/provision-tenant` | `restaurantName`, `ownerName`, `email` (req.); `password`, `requestedPlanId`, `enableWebStore` (def. `true`) |
| POST | `/api/sales-bot/seed-menu` | `restaurantId`, `categories` |
| GET | `/api/sales-bot/tenant-status` | `?slug=` o `?id=` |

### Camino B — manual (respaldo, no depende del PR)
1. Crea el tenant demo "La Guarida" desde `/admin` (registro normal).
2. Carga a mano las 3 categorías y los 14 platillos del JSON de arriba.
3. Activa la tienda online (`hasWebStore`).

Para la demo se ve idéntico; solo pierdes el *"te lo activo ahorita mismo"*
automático en el cierre.

---

## 4) Checklist final (antes de las 8:00 PM)
- [ ] Mensaje de confirmación enviado (y **"Responder manualmente"** activado).
- [ ] Camino A o B ejecutado: tienda de La Guarida con su menú cargado.
- [ ] Abrir la tienda **desde tu celular** una vez, para que no falle en vivo.
- [ ] Tener a la mano `foundersLeft` (cuántos lugares quedan) para la urgencia.
- [ ] **8:00 PM en punto: tú marcas la videollamada.** No esperes a que él marque.
