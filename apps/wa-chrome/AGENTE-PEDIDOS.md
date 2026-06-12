# Pedido estructurado — protocolo agente → bot

El bot de la extensión deja de adivinar el pedido de la cháchara del cliente: si en
el chat aparece un **bloque con palabra clave**, lo toma tal cual (resumen limpio).
Esto sube la precisión a casi 100% y mantiene el bot **100% solo-lectura** (no envía
nada → riesgo de baneo ~nulo).

Quién genera ese bloque da igual: la **IA de WhatsApp Business**, una **respuesta
rápida** que inserta el cajero, o incluso el cliente siguiendo el formato. El bot
sólo lo lee.

## Formato que debe emitir el agente

Una sola burbuja de mensaje, empezando con la palabra clave:

```
PEDIDO LISTO
• 1 Refresco 600ml
• 2 Hamburguesa sencilla
• 1 Burrito Frijoles y Chorizo sin nopales
Tipo: Domicilio
Dirección: Pedrera 123, entre Juárez y Morelos
Tel: 9991234567
```

### Reglas del formato
- **Primera línea = palabra clave.** El bot reconoce: `PEDIDO LISTO`, `PEDIDO
  CONFIRMADO`, `PEDIDO FINAL`, `PEDIDO COMPLETO`, `RESUMEN DEL PEDIDO` o
  `ORDER READY` (mayúsculas/minúsculas dan igual).
- **Productos:** una línea por producto, con viñeta (`•`, `-`, `*`) o sin ella.
  Idealmente `cantidad + nombre` (ej. `2 Hamburguesa sencilla`). Las notas del
  platillo van en la misma línea (`sin nopales`, `extra queso`).
- **Variante / sabor / tamaño en la MISMA línea.** Si el producto la tiene, inclúyela
  junto al nombre para que el bot la asigne sola (ej. `1 kg de Boneless BBQ`,
  `1 Alambre de Pollo`, `1 Agua de Sabor Jamaica`). Productos como Alitas/Boneless
  **exigen sabor**: sin él, el panel marca ⚠ y el cajero lo completa en el TPV.
- **`Tipo:`** `Domicilio` o `Para llevar`. Opcional — si pones `Dirección:` el bot
  asume Domicilio solo.
- **`Dirección:`** texto libre. Pre-llena el campo de entrega en el panel.
- **`Tel:`** (o `Teléfono:`, `Celular:`, `WhatsApp:`) sólo dígitos o con espacios/
  guiones. El bot lo limpia y lo guarda con el pedido.

Las líneas `Cliente:`, `Nombre:`, `Total:`, `Subtotal:`, `Pago:`, `Notas:` se
ignoran como producto (no estorban).

## Cómo configurar el agente

### Opción A — Meta Business Agent (la IA nativa de WhatsApp Business)
Meta lanzó el **Meta Business Agent globalmente el 3-jun-2026** (gratis por ahora).
Se configura **dentro de la app de WhatsApp Business** → *Herramientas para la
empresa* → se gestiona desde un chat especial llamado **"Tu agente de IA"**, donde
le das instrucciones en lenguaje natural y lo corriges.

**Modo recomendado: "Sugerencias"** (no "Automático completo"). En Sugerencias la IA
redacta la respuesta pero **el cajero la envía** → encaja con tu filosofía "el cajero
confirma" y baja el riesgo de baneo. Modos disponibles:
- **Mi respuesta** — todo manual, la IA no participa.
- **Sugerencias** — la IA redacta, tú envías. ← recomendado.
- **Automático** — la IA contesta sola.

**Conocimiento:** sube tu menú/catálogo (PDF o el catálogo de WhatsApp) para que
conozca productos y precios.

**Instrucción para el formato** — pégala en el chat "Tu agente de IA":

> Cuando el cliente confirme su pedido, redacta un único mensaje que empiece con la
> línea `PEDIDO LISTO` y debajo lista cada producto en su propia línea con viñeta y
> cantidad (ej. `• 2 Hamburguesa sencilla`). Incluye en la misma línea la variante,
> sabor o tamaño elegido (ej. `• 1 kg de Boneless BBQ`, `• 1 Alambre de Pollo`). Si
> es a domicilio agrega `Tipo: Domicilio`, `Dirección: ...` y `Tel: ...`. Si es para
> llevar agrega `Tipo: Para llevar`. No agregues precios ni texto extra después de
> esa lista.

Como nuestro bot lee TODOS los mensajes del chat (entrantes y salientes), detecta
ese bloque sin importar que lo haya enviado el agente como negocio.

> **Futuro (opcional):** el *Meta Business Agent Platform* (tier empresarial) puede
> conectarse a sistemas externos (tipo Shopify/Zendesk). Más adelante el agente
> podría hacer `POST` directo a nuestro backend sin extensión. Por ahora el camino
> lector (este) es gratis y suficiente.

### Opción B — Respuesta rápida (sin IA, funciona en cualquier WhatsApp Business)
Crea una respuesta rápida (Ajustes → Herramientas para la empresa → Respuestas
rápidas) con atajo `/pedido` y este cuerpo, que el cajero rellena antes de enviar:

```
PEDIDO LISTO
• 
Tipo: Para llevar
Dirección: 
Tel: 
```

El cajero escribe `/pedido`, completa los productos y envía. El bot lo detecta solo.

## Flujo completo
1. El agente (IA o cajero) deja el bloque `PEDIDO LISTO ...` en el chat.
2. El vigilante de la extensión marca ese chat (la palabra clave dispara detección).
3. El cajero abre el chat → el panel lo **auto-lee** y muestra
   `📋 Pedido estructurado del agente` con productos, tipo, dirección y tel ya
   pre-llenados.
4. El cajero revisa y da **✅ Crear en TPV** → queda PENDING en "Pedidos Web".
