# @mrtpvrest/wa-mcp

Servidor **MCP** que deja a un asistente IA (Claude, etc.) tomar pedidos de
WhatsApp y mandarlos al TPV, usando el núcleo [`@mrtpvrest/wa-orders`](../../packages/wa-orders).

Sin dependencias: implementa el transporte **stdio** de MCP a mano (JSON-RPC 2.0
por líneas). El parseo usa la Groq key **BYOK** del restaurante del lado servidor
(`/api/store/parse-order`), así que el MCP **no maneja ninguna API key**.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| `wa_menu` | Lista el menú (productos + precio). |
| `wa_preview_order` | Interpreta un texto de pedido y devuelve los productos reconocidos, **sin crear nada**. |
| `wa_create_order` | Crea el pedido en el TPV (queda **PENDING** en "Pedidos Web" para que el cajero confirme). |

## Configurar en un host MCP

**Claude Code** (`~/.claude.json` o `.mcp.json` del proyecto):

```json
{
  "mcpServers": {
    "wa-orders": {
      "command": "node",
      "args": ["C:/Users/colon/Downloads/mrtpvrest/apps/wa-mcp/src/server.js"],
      "env": { "WA_SLUG": "master-burguer-s" }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`): mismo bloque `mcpServers`.

Variables: `WA_SLUG` (tienda por defecto), `WA_API_BASE` (def. `https://api.mrtpvrest.com`).

## Probar a mano (sin host)

```bash
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
 '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"wa_preview_order","arguments":{"text":"2 alitas bbq y una hawaiana"}}}' \
 | node apps/wa-mcp/src/server.js
```

## Uso típico (desde el asistente)

1. El cliente escribe por WhatsApp: *"me das 2 alitas bbq y una hawaiana a domicilio, calle 5 #10"*.
2. El asistente llama `wa_preview_order` → confirma productos.
3. Llama `wa_create_order` con nombre/dirección → el pedido cae en **Pedidos Web** del TPV.
4. El **cajero lo acepta** → cocina.
