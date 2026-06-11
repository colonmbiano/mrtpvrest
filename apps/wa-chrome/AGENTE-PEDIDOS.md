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
- **`Tipo:`** `Domicilio` o `Para llevar`. Opcional — si pones `Dirección:` el bot
  asume Domicilio solo.
- **`Dirección:`** texto libre. Pre-llena el campo de entrega en el panel.
- **`Tel:`** (o `Teléfono:`, `Celular:`, `WhatsApp:`) sólo dígitos o con espacios/
  guiones. El bot lo limpia y lo guarda con el pedido.

Las líneas `Cliente:`, `Nombre:`, `Total:`, `Subtotal:`, `Pago:`, `Notas:` se
ignoran como producto (no estorban).

## Cómo configurar el agente

### Opción A — Asistente de IA de WhatsApp Business (si tu cuenta lo tiene)
En las instrucciones/“personalidad” del asistente, agrega al final:

> Cuando el cliente confirme su pedido, responde con un único mensaje que empiece
> con la línea `PEDIDO LISTO` y debajo lista cada producto en su propia línea con
> viñeta y cantidad. Si es a domicilio agrega `Tipo: Domicilio`, `Dirección: ...` y
> `Tel: ...`. Si es para llevar agrega `Tipo: Para llevar`. No agregues precios ni
> texto extra después de esa lista.

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
