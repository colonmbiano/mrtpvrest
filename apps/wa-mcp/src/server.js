#!/usr/bin/env node
// Servidor MCP de pedidos WhatsApp → TPV.
//
// Expone el núcleo @mrtpvrest/wa-orders como herramientas para que un asistente
// (Claude u otro host MCP) tome pedidos: ver el menú, previsualizar un pedido a
// partir de texto, y crear el borrador en el TPV (queda PENDING para el cajero).
//
// Sin dependencias: implementa el transporte STDIO de MCP a mano (JSON-RPC 2.0
// delimitado por líneas). Probado contra el handshake estándar (initialize →
// tools/list → tools/call).
//
// Config en un host MCP (ej. claude_desktop_config.json):
//   "wa-orders": { "command": "node",
//                  "args": ["RUTA/apps/wa-mcp/src/server.js"],
//                  "env": { "WA_SLUG": "master-burguer-s" } }

import { createInterface } from "node:readline";
import { textToOrder, fetchMenu } from "../../../packages/wa-orders/src/index.js";

const PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_SLUG = process.env.WA_SLUG || "master-burguer-s";

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
const textContent = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });

const TOOLS = [
  {
    name: "wa_menu",
    description: "Lista el menú de la tienda (categorías y productos con precio). Útil antes de tomar un pedido.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Slug de la tienda (opcional; por defecto la configurada)." } },
    },
  },
  {
    name: "wa_preview_order",
    description: "Interpreta un texto de pedido de WhatsApp y devuelve los productos reconocidos del menú, SIN crear nada. Úsalo para confirmar antes de crear.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Mensaje del cliente, p.ej. '2 alitas bbq y una hawaiana'." },
        slug: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "wa_create_order",
    description: "Crea el pedido en el TPV a partir del texto del cliente. Queda PENDING en 'Pedidos Web' para que el cajero lo confirme antes de cocina. Devuelve el número y total del pedido.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Mensaje del cliente con los productos." },
        customerName: { type: "string", description: "Nombre del cliente." },
        customerPhone: { type: "string", description: "Teléfono (opcional)." },
        orderType: { type: "string", enum: ["DELIVERY", "TAKEOUT", "DINE_IN"], description: "Tipo de pedido (default TAKEOUT, o DELIVERY si hay dirección)." },
        deliveryAddress: { type: "string", description: "Dirección (requerida si DELIVERY)." },
        slug: { type: "string" },
      },
      required: ["text"],
    },
  },
];

async function callTool(name, args) {
  const slug = args.slug || DEFAULT_SLUG;
  if (name === "wa_menu") {
    const menu = await fetchMenu(slug);
    const summary = menu.items.map((i) => ({ id: i.id, nombre: i.name, precio: i.price }));
    return textContent({ productos: summary.length, items: summary });
  }
  if (name === "wa_preview_order") {
    const r = await textToOrder({ slug, text: args.text, dryRun: true });
    return textContent({
      motor: r.engine,
      productos: r.parsed.map((p) => ({ cantidad: p.quantity, producto: p.label, precio: p.price })),
      no_reconocido: r.unmatched,
    });
  }
  if (name === "wa_create_order") {
    const r = await textToOrder({
      slug,
      text: args.text,
      orderType: args.orderType,
      customer: { name: args.customerName, phone: args.customerPhone, address: args.deliveryAddress },
    });
    if (!r.created) {
      return { ...textContent({ creado: false, error: r.error, motor: r.engine, productos: r.parsed }), isError: true };
    }
    return textContent({
      creado: true,
      pedido: r.order?.orderNumber || r.order?.id,
      total: r.order?.total,
      motor: r.engine,
      nota: "PENDING en 'Pedidos Web'. El cajero debe aceptarlo para mandarlo a cocina.",
    });
  }
  throw new Error(`Herramienta desconocida: ${name}`);
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "wa-orders", version: "0.1.0" },
    });
  }
  if (method === "notifications/initialized" || method?.startsWith("notifications/")) return; // sin respuesta
  if (method === "tools/list") return ok(id, { tools: TOOLS });
  if (method === "tools/call") {
    try {
      const result = await callTool(params?.name, params?.arguments || {});
      return ok(id, result);
    } catch (e) {
      return ok(id, { ...textContent({ error: e.message }), isError: true });
    }
  }
  if (method === "ping") return ok(id, {});
  if (id !== undefined) return fail(id, -32601, `Método no soportado: ${method}`);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }
  try { await handle(msg); } catch (e) { if (msg?.id !== undefined) fail(msg.id, -32603, e.message); }
});
