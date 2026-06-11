# @mrtpvrest/wa-orders

Núcleo reutilizable que convierte **texto de un pedido de WhatsApp → borrador en el TPV**.

Flujo (modo solo-lectura, el cajero confirma antes de cocina):

```
texto del cliente
   → fetchMenu(slug)         menú público de la tienda
   → parseOrder(text, menu)  items del menú (heurístico; IA opcional)
   → createDraftOrder(...)   POST /api/store/orders  (source=WHATSAPP, PENDING)
   → aparece en "Pedidos Web" del TPV → el cajero ACEPTA → cocina
```

El backend **recalcula los precios** desde la BD; aquí solo se mandan `menuItemId` + cantidad, así que un parseo imperfecto no cobra mal: el cajero revisa y confirma.

## Probar (CLI)

```bash
# Solo parsear (no crea nada) — lee el menú real:
node packages/wa-orders/src/cli.js "2 alitas bbq y una hamburguesa hawaiana"

# Crear el pedido de verdad en el TPV (queda PENDING para el cajero):
node packages/wa-orders/src/cli.js "2 alitas bbq, una hawaiana" --send --name "Juan" --phone 7221234567

# A domicilio (requiere dirección):
node packages/wa-orders/src/cli.js "1 boneless bbq" --send --type DELIVERY --address "Calle 5 #10" --name "Ana"
```

Flags: `--send` (crea; por defecto dry-run), `--slug` (def. `master-burguer-s`),
`--type DELIVERY|TAKEOUT|DINE_IN`, `--address`, `--phone`, `--name`, `--api` (URL base).

## API

```js
import { textToOrder } from "@mrtpvrest/wa-orders";

const r = await textToOrder({
  slug: "master-burguer-s",
  text: "2 alitas bbq y una hawaiana",
  customer: { name: "Juan", phone: "7221234567" },
  dryRun: false,           // true = solo previsualiza
  // llm: miParserIA,      // FASE 1: inyecta un parser de IA (Groq/Gemini)
});
// r = { parsed, unmatched, created, order, error }
```

## Roadmap

- **Fase 0 (esto):** núcleo + CLI. `WHATSAPP` habilitado como `source` en backend/TPV.
- **Fase 1:** servidor MCP (`apps/wa-mcp`) que expone `wa_parse_order` / `wa_create_draft_order` / `wa_menu`.
- **Fase 2:** bot Baileys (`apps/wa-bridge`) que lee WhatsApp Web y crea borradores (solo-lectura, anti-baneo).
- **Fase 3:** multi-tenant (número→restaurante), despliegue en Railway, sesión persistente.

## Notas

- El parser de Fase 0 es heurístico (match por tokens + IDF + tolerancia a typos). Para casos difíciles se inyecta IA vía `opts.llm` sin cambiar el resto.
- Respeta tienda abierta/cerrada y mínimo de compra (igual que los pedidos online).
