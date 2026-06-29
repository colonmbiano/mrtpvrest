#!/usr/bin/env node
// Servidor MCP de Google Search Console.
//
// Usa una cuenta de servicio via GOOGLE_APPLICATION_CREDENTIALS. En Search
// Console, agrega el client_email de esa cuenta como usuario de la propiedad.

import { createInterface } from "node:readline";
import { google } from "googleapis";

const PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_SITE_URL = process.env.GSC_SITE_URL || "sc-domain:mrtpvrest.com";
const SCOPE = process.env.GSC_READONLY === "1"
  ? "https://www.googleapis.com/auth/webmasters.readonly"
  : "https://www.googleapis.com/auth/webmasters";

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
const textContent = (obj) => ({
  content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }],
});

const auth = new google.auth.GoogleAuth({ scopes: [SCOPE] });
const webmasters = google.webmasters({ version: "v3", auth });
const searchconsole = google.searchconsole({ version: "v1", auth });

const isoDate = (date) => date.toISOString().slice(0, 10);
const daysAgo = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
};

const TOOLS = [
  {
    name: "gsc_sites",
    description: "Lista las propiedades de Google Search Console visibles para la cuenta de servicio.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "gsc_performance",
    description: "Consulta rendimiento de Search Console: clics, impresiones, CTR y posicion por query, pagina, pais, dispositivo o fecha.",
    inputSchema: {
      type: "object",
      properties: {
        siteUrl: { type: "string", description: "Propiedad GSC. Ej: sc-domain:mrtpvrest.com o https://mrtpvrest.com/." },
        startDate: { type: "string", description: "YYYY-MM-DD. Por defecto: hace 30 dias." },
        endDate: { type: "string", description: "YYYY-MM-DD. Por defecto: hace 2 dias por el retraso normal de GSC." },
        dimensions: {
          type: "array",
          items: { type: "string", enum: ["query", "page", "country", "device", "date", "searchAppearance"] },
          description: "Dimensiones a agrupar. Por defecto: query,page.",
        },
        rowLimit: { type: "number", description: "Maximo de filas. Por defecto 25." },
        startRow: { type: "number", description: "Offset de paginacion. Por defecto 0." },
        searchType: {
          type: "string",
          enum: ["web", "image", "video", "news", "discover", "googleNews"],
          description: "Tipo de busqueda. Por defecto web.",
        },
        dimensionFilterGroups: {
          type: "array",
          description: "Filtros nativos de searchanalytics.query. Ej: [{filters:[{dimension:'page',operator:'contains',expression:'/moda'}]}].",
        },
        pageContains: { type: "string", description: "Atajo para filtrar paginas que contienen este texto." },
        queryContains: { type: "string", description: "Atajo para filtrar queries que contienen este texto." },
      },
    },
  },
  {
    name: "gsc_inspect_url",
    description: "Inspecciona el estado de indexacion de una URL en Google Search Console.",
    inputSchema: {
      type: "object",
      properties: {
        inspectionUrl: { type: "string", description: "URL completa a inspeccionar." },
        siteUrl: { type: "string", description: "Propiedad GSC. Por defecto GSC_SITE_URL." },
        languageCode: { type: "string", description: "Codigo opcional, ej. es-MX." },
      },
      required: ["inspectionUrl"],
    },
  },
  {
    name: "gsc_submit_sitemap",
    description: "Envia un sitemap a Google Search Console. Requiere permiso de propietario en la propiedad.",
    inputSchema: {
      type: "object",
      properties: {
        sitemapUrl: { type: "string", description: "URL completa del sitemap, ej. https://mrtpvrest.com/sitemap.xml." },
        siteUrl: { type: "string", description: "Propiedad GSC. Por defecto GSC_SITE_URL." },
      },
      required: ["sitemapUrl"],
    },
  },
  {
    name: "gsc_list_sitemaps",
    description: "Lista los sitemaps registrados en Google Search Console para una propiedad.",
    inputSchema: {
      type: "object",
      properties: {
        siteUrl: { type: "string", description: "Propiedad GSC. Por defecto GSC_SITE_URL." },
      },
    },
  },
];

function siteUrl(args = {}) {
  return args.siteUrl || DEFAULT_SITE_URL;
}

function buildFilterGroups(args) {
  if (Array.isArray(args.dimensionFilterGroups)) return args.dimensionFilterGroups;

  const filters = [];
  if (args.pageContains) {
    filters.push({ dimension: "page", operator: "contains", expression: args.pageContains });
  }
  if (args.queryContains) {
    filters.push({ dimension: "query", operator: "contains", expression: args.queryContains });
  }
  return filters.length ? [{ groupType: "and", filters }] : undefined;
}

function normalizeRows(rows = [], dimensions = []) {
  return rows.map((row) => {
    const keys = {};
    dimensions.forEach((dimension, index) => {
      keys[dimension] = row.keys?.[index];
    });
    return {
      ...keys,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    };
  });
}

async function callTool(name, args = {}) {
  if (name === "gsc_sites") {
    const { data } = await webmasters.sites.list();
    return textContent({
      siteEntry: (data.siteEntry || []).map((site) => ({
        siteUrl: site.siteUrl,
        permissionLevel: site.permissionLevel,
      })),
    });
  }

  if (name === "gsc_performance") {
    const dimensions = args.dimensions || ["query", "page"];
    const requestBody = {
      startDate: args.startDate || daysAgo(30),
      endDate: args.endDate || daysAgo(2),
      dimensions,
      rowLimit: args.rowLimit || 25,
      startRow: args.startRow || 0,
      searchType: args.searchType || "web",
      dimensionFilterGroups: buildFilterGroups(args),
    };

    const { data } = await webmasters.searchanalytics.query({
      siteUrl: siteUrl(args),
      requestBody,
    });

    return textContent({
      siteUrl: siteUrl(args),
      request: requestBody,
      rows: normalizeRows(data.rows || [], dimensions),
      responseAggregationType: data.responseAggregationType,
    });
  }

  if (name === "gsc_inspect_url") {
    const requestBody = {
      inspectionUrl: args.inspectionUrl,
      siteUrl: siteUrl(args),
      languageCode: args.languageCode,
    };
    const { data } = await searchconsole.urlInspection.index.inspect({ requestBody });
    return textContent(data);
  }

  if (name === "gsc_submit_sitemap") {
    await webmasters.sitemaps.submit({
      siteUrl: siteUrl(args),
      feedpath: args.sitemapUrl,
    });
    return textContent({ submitted: true, siteUrl: siteUrl(args), sitemapUrl: args.sitemapUrl });
  }

  if (name === "gsc_list_sitemaps") {
    const { data } = await webmasters.sitemaps.list({ siteUrl: siteUrl(args) });
    return textContent({ siteUrl: siteUrl(args), sitemap: data.sitemap || [] });
  }

  throw new Error(`Herramienta desconocida: ${name}`);
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "gsc-mcp", version: "0.1.0" },
    });
  }
  if (method === "notifications/initialized" || method?.startsWith("notifications/")) return;
  if (method === "tools/list") return ok(id, { tools: TOOLS });
  if (method === "tools/call") {
    try {
      return ok(id, await callTool(params?.name, params?.arguments || {}));
    } catch (e) {
      return ok(id, { ...textContent({ error: e.message, code: e.code, status: e.status }), isError: true });
    }
  }
  if (method === "ping") return ok(id, {});
  if (id !== undefined) return fail(id, -32601, `Metodo no soportado: ${method}`);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  try {
    await handle(msg);
  } catch (e) {
    if (msg?.id !== undefined) fail(msg.id, -32603, e.message);
  }
});
