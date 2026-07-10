// saas-sales-mcp
// Servidor MCP (stdio) que le da a Claude las "manos" para atender el bot de
// ventas del SaaS por WhatsApp. CLAUDE es el cerebro: este servidor NO llama a
// ningún LLM. Solo expone herramientas de mensajería (contra el worker) y un
// pipeline de leads (CRM en JSON).
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  WORKER_URL,
  MRTPV_API_BASE,
  MRTPV_SALES_BOT_TOKEN,
} from "./config.js";
import {
  STAGES,
  getLead,
  listLeads,
  upsertLead,
  touchLead,
} from "./leads.js";

// --- Helper para hablar con el worker de WhatsApp ---------------------------
async function worker(pathname, { method = "GET", body } = {}) {
  let resp;
  try {
    resp = await fetch(`${WORKER_URL}${pathname}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(
      `No pude contactar al worker de WhatsApp en ${WORKER_URL}. ` +
        `¿Está corriendo? Arráncalo con: npm run worker  (dentro de tools/saas-sales-mcp). ` +
        `Detalle: ${e?.message || e}`
    );
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok)
    throw new Error(data?.error || `worker respondió ${resp.status}`);
  return data;
}

// --- Helper para hablar con el backend MRTPV (tools v2) ---------------------
async function backend(pathname, { method = "GET", body } = {}) {
  if (!MRTPV_SALES_BOT_TOKEN) {
    throw new Error(
      "MRTPV_SALES_BOT_TOKEN no está configurado en el .env del MCP. " +
        "Los tools de alta (saas_*) lo necesitan; la mensajería sí funciona sin él."
    );
  }
  let resp;
  try {
    resp = await fetch(`${MRTPV_API_BASE}${pathname}`, {
      method,
      headers: {
        "x-sales-token": MRTPV_SALES_BOT_TOKEN,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(
      `No pude contactar al backend en ${MRTPV_API_BASE}. Detalle: ${e?.message || e}`
    );
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok)
    throw new Error(
      `backend ${resp.status}: ${data?.error || "error"}${data?.code ? ` (${data.code})` : ""}`
    );
  return data;
}

const ok = (obj) => ({
  content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
});
const fail = (msg) => ({
  content: [{ type: "text", text: `ERROR: ${msg}` }],
  isError: true,
});

// --- Definición de herramientas --------------------------------------------
const TOOLS = [
  {
    name: "wa_status",
    description:
      "Estado de la conexión de WhatsApp del número de ventas. Si hay un QR pendiente, lo devuelve para vincular.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "wa_inbox",
    description:
      "Bandeja de trabajo: conversaciones con no-leídos, o cuyo último mensaje es entrante y reciente (24h por defecto). Cada fila trae `isLead` y `stage`. ATENCIÓN: este número puede tener chats que NO son prospectos del SaaS (proveedores, conocidos). NUNCA respondas a un chat con isLead=false sin confirmarlo antes con el usuario.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Máx conversaciones (def 20)." },
        unreadOnly: {
          type: "boolean",
          description: "Solo chats con mensajes sin leer (lo más conservador).",
        },
        hours: {
          type: "number",
          description: "Ventana de recencia en horas (def 24).",
        },
      },
    },
  },
  {
    name: "wa_read",
    description:
      "Lee el historial reciente de UNA conversación por chatId. Úsalo antes de responder para tener contexto. Marca el lead como visto.",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string", description: "chatId de wa_inbox." },
        limit: { type: "number", description: "Máx mensajes (def 30)." },
      },
      required: ["chatId"],
    },
  },
  {
    name: "wa_send",
    description:
      "Envía TU respuesta (la que tú, Claude, redactaste) a una conversación. Modo solo-responder: no hagas envíos masivos ni en frío. Este número tiene chats que NO son prospectos: si el chat no está en el pipeline (isLead=false en wa_inbox), confirma con el usuario ANTES de enviar. El worker bloquea duplicados recientes.",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string", description: "chatId destino." },
        text: { type: "string", description: "Texto a enviar." },
      },
      required: ["chatId", "text"],
    },
  },
  {
    name: "lead_stages",
    description:
      "Devuelve las etapas válidas del pipeline de ventas y su significado.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "lead_list",
    description:
      "Lista los leads del pipeline (opcionalmente filtrados por etapa), ordenados por actividad reciente.",
    inputSchema: {
      type: "object",
      properties: {
        stage: { type: "string", enum: STAGES, description: "Filtro opcional." },
      },
    },
  },
  {
    name: "lead_get",
    description: "Ficha completa de un lead (etapa, datos del negocio, notas).",
    inputSchema: {
      type: "object",
      properties: { chatId: { type: "string" } },
      required: ["chatId"],
    },
  },
  {
    name: "lead_save",
    description:
      "Crea o actualiza un lead: mueve de etapa, guarda nombre/negocio/rubro y agrega una nota. Úsalo tras cada interacción para no perder el hilo entre sesiones.",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string", description: "chatId del lead." },
        stage: { type: "string", enum: STAGES },
        name: { type: "string", description: "Nombre del contacto." },
        business: { type: "string", description: "Nombre del negocio." },
        businessType: {
          type: "string",
          description: "Rubro (hamburguesas, pizzería, etc.).",
        },
        phone: { type: "string" },
        tenantId: {
          type: "string",
          description: "Id del tenant si ya se dio de alta.",
        },
        note: { type: "string", description: "Nota a agregar al historial." },
      },
      required: ["chatId"],
    },
  },

  // ── v2: acciones del SaaS (alta / menú / promo) contra el backend MRTPV ──
  {
    name: "saas_founders_status",
    description:
      "Lugares de fundador restantes y días de trial vigentes (para dar urgencia: '6 meses gratis, quedan N lugares').",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "saas_demo_link",
    description:
      "Devuelve el link de la tienda demo para mostrar el flujo de pedido en vivo durante la demo.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "saas_create_tenant",
    description:
      "DA DE ALTA la cuenta del prospecto (tenant + trial + restaurante + sucursal + usuario admin + PIN 1234) y activa la promo. Úsalo al cerrar la venta. Si no pasas password, genera una temporal y la devuelve para que se la mandes al dueño. Devuelve restaurantId (necesario para saas_seed_menu), link de tienda y credenciales.",
    inputSchema: {
      type: "object",
      properties: {
        restaurantName: { type: "string", description: "Nombre del negocio." },
        ownerName: { type: "string", description: "Nombre del dueño." },
        email: { type: "string", description: "Email del dueño (será su login)." },
        password: {
          type: "string",
          description: "Opcional. Si se omite, se genera una temporal.",
        },
        businessType: {
          type: "string",
          description: "Rubro (informativo).",
        },
      },
      required: ["restaurantName", "ownerName", "email"],
    },
  },
  {
    name: "saas_seed_menu",
    description:
      "Siembra el menú de ejemplo que capturaste en la charla, en un tenant ya creado. Úsalo justo después de saas_create_tenant con su restaurantId.",
    inputSchema: {
      type: "object",
      properties: {
        restaurantId: {
          type: "string",
          description: "restaurantId devuelto por saas_create_tenant.",
        },
        categories: {
          type: "array",
          description:
            "Categorías con sus platillos: [{ name, items: [{ name, price, description? }] }].",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    price: { type: "number" },
                    description: { type: "string" },
                  },
                  required: ["name", "price"],
                },
              },
            },
            required: ["name", "items"],
          },
        },
      },
      required: ["restaurantId", "categories"],
    },
  },
  {
    name: "saas_tenant_status",
    description:
      "Estado de un tenant ya creado (trial, verificación de email, tienda online) — para la etapa de soporte/seguimiento. Pasa slug o id.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        id: { type: "string" },
      },
    },
  },
];

// --- Servidor ----------------------------------------------------------------
const server = new Server(
  { name: "saas-sales-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    switch (name) {
      case "wa_status":
        return ok(await worker("/status"));

      case "wa_inbox": {
        const params = new URLSearchParams();
        if (args.limit) params.set("limit", String(Number(args.limit)));
        if (args.unreadOnly) params.set("unreadOnly", "1");
        if (args.hours) params.set("hours", String(Number(args.hours)));
        const qs = params.toString();
        const data = await worker(`/queue${qs ? `?${qs}` : ""}`);
        // Anotar cada conversación con su estado en el pipeline: este número
        // tiene chats que no son prospectos y no se les debe contestar.
        const conversations = (data.conversations || []).map((c) => {
          const lead = getLead(c.chatId);
          return {
            ...c,
            isLead: !!lead,
            stage: lead?.stage || null,
            business: lead?.business || null,
          };
        });
        const ajenos = conversations.filter((c) => !c.isLead).length;
        return ok({
          ...data,
          conversations,
          aviso:
            ajenos > 0
              ? `${ajenos} de estas conversaciones NO están en el pipeline (isLead=false). No les respondas sin confirmar con el usuario.`
              : undefined,
        });
      }

      case "wa_read": {
        if (!args.chatId) return fail("chatId requerido.");
        const q = args.limit ? `?limit=${Number(args.limit)}` : "";
        const data = await worker(
          `/chat/${encodeURIComponent(args.chatId)}${q}`
        );
        touchLead(args.chatId, "in", {
          phone: data.phone || undefined,
          name: data.name || undefined,
        });
        return ok(data);
      }

      case "wa_send": {
        if (!args.chatId || !args.text)
          return fail("chatId y text son requeridos.");
        const data = await worker("/send", {
          method: "POST",
          body: { chatId: args.chatId, text: args.text },
        });
        touchLead(args.chatId, "out");
        return ok(data);
      }

      case "lead_stages":
        return ok({
          stages: STAGES,
          significado: {
            NUEVO: "Entró, aún sin calificar.",
            CALIFICANDO: "Averiguando rubro, dolor y cómo recibe pedidos.",
            DEMO: "Demo ofrecida, agendada o en curso.",
            ONBOARDING: "Capturando datos para dar de alta la cuenta.",
            ACTIVADO: "Cuenta creada + 6 meses activados.",
            SOPORTE: "Ya es cliente; dudas de uso / retención.",
            DESCARTADO: "No interesado / no calificado.",
          },
        });

      case "lead_list":
        return ok({ leads: listLeads(args.stage) });

      case "lead_get": {
        if (!args.chatId) return fail("chatId requerido.");
        const lead = getLead(args.chatId);
        return lead ? ok(lead) : fail(`Sin lead para ${args.chatId}.`);
      }

      case "lead_save": {
        if (!args.chatId) return fail("chatId requerido.");
        const { chatId, note, ...patch } = args;
        return ok(upsertLead(chatId, patch, note));
      }

      // ── v2: acciones del SaaS ──────────────────────────────────────────
      case "saas_founders_status":
        return ok(await backend("/api/sales-bot/founders-status"));

      case "saas_demo_link":
        return ok(await backend("/api/sales-bot/demo-link"));

      case "saas_create_tenant": {
        if (!args.restaurantName || !args.ownerName || !args.email)
          return fail("restaurantName, ownerName y email son requeridos.");
        const data = await backend("/api/sales-bot/provision-tenant", {
          method: "POST",
          body: {
            restaurantName: args.restaurantName,
            ownerName: args.ownerName,
            email: args.email,
            password: args.password,
          },
        });
        return ok(data);
      }

      case "saas_seed_menu": {
        if (!args.restaurantId || !Array.isArray(args.categories))
          return fail("restaurantId y categories (arreglo) son requeridos.");
        const data = await backend("/api/sales-bot/seed-menu", {
          method: "POST",
          body: { restaurantId: args.restaurantId, categories: args.categories },
        });
        return ok(data);
      }

      case "saas_tenant_status": {
        if (!args.slug && !args.id) return fail("Pasa slug o id.");
        const q = args.id
          ? `?id=${encodeURIComponent(args.id)}`
          : `?slug=${encodeURIComponent(args.slug)}`;
        return ok(await backend(`/api/sales-bot/tenant-status${q}`));
      }

      default:
        return fail(`Herramienta desconocida: ${name}`);
    }
  } catch (e) {
    return fail(e?.message || String(e));
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[saas-sales-mcp] servidor MCP listo (stdio).");
