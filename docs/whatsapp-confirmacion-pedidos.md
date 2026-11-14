# Confirmación de pedidos de WhatsApp

El cierre del pedido usa una cotización del servidor, guardada en la sesión
existente como `confirmedQuote`. No necesita migraciones ni proveedores nuevos.

## Comportamiento

1. Al elegir el pago, el servidor consulta productos y variantes disponibles del
   restaurante, valida cantidades y promociones y calcula el envío. Presenta ese
   resumen al cliente y pide `CONFIRMAR`.
2. Solo acepta respuestas completas: `confirmar`, `confirmo`, `sí` o `1`.
   Preguntas y frases como «no confirmo» no generan pedidos.
3. Al confirmar vuelve a consultar el catálogo. Si cambia un precio, cantidad o
   envío, presenta un resumen actualizado y exige otra confirmación. Una sesión
   anterior sin cotización recibe primero este resumen.
4. Un producto o variante no disponible bloquea el pedido completo y permite
   corregir el carrito con `quitar N`. Nunca se omiten líneas silenciosamente.
5. Las cantidades acumuladas de hasta 99 unidades se conservan; las inválidas se
   rechazan. Antes, un carrito de 75 unidades se reducía a 50 al crear la orden.

Ejemplo: el cliente revisa 2 hamburguesas de $100 más $25 de envío ($225).
Si el precio sube a $120, su primer `CONFIRMAR` recibe el nuevo total de $265 y
no crea la orden. Una segunda confirmación acepta esos $265.

## Validación

Desde `apps/backend`:

```bash
pnpm exec jest --runInBand --runTestsByPath \
  __tests__/whatsapp-bot.checkout.test.js \
  __tests__/whatsapp-bot.engine.test.js \
  __tests__/whatsapp-bot.helpers.test.js \
  __tests__/delivery-pin.whatsapp.test.js \
  __tests__/whatsapp-inbox.test.js \
  __tests__/whatsapp-upsell.test.js \
  __tests__/whatsapp-bot-module.test.js
```

Las pruebas simulan la BD y los proveedores; no crean órdenes operativas ni
envían mensajes reales.

## Estado y siguientes pasos

La pausa explícita al inicio de `handleWebhook` se conserva. Este cambio no
reactiva el bot. Antes de activarlo, sigue pendiente revisar la autenticación de
los webhooks entrantes según el proveedor, la cola duradera, la deduplicación
persistente, la serialización por conversación y la creación idempotente. Los
reintentos concurrentes y los fallos entre crear la orden y guardar la sesión
no quedan resueltos por esta cotización. Se requiere una prueba integral con un
número de prueba y las credenciales configuradas fuera del repositorio.
