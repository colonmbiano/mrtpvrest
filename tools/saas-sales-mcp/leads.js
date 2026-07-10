// CRM ligero de leads del SaaS en un archivo JSON (sin dependencias nativas).
// Un lead = una conversación de WhatsApp (clave = chatId). Bajo volumen; JSON
// con escritura atómica es más que suficiente y no requiere compilar nada.
import fs from "node:fs";
import path from "node:path";
import { LEADS_PATH } from "./config.js";

export const STAGES = [
  "NUEVO", // entró, aún sin calificar
  "CALIFICANDO", // averiguando rubro/dolor/cómo recibe pedidos
  "DEMO", // demo ofrecida/agendada/en curso
  "ONBOARDING", // capturando datos para dar de alta
  "ACTIVADO", // cuenta creada + 6 meses activados
  "SOPORTE", // ya cliente, dudas de uso / retención
  "DESCARTADO", // no interesado / no calificado
];

function ensureFile() {
  const dir = path.dirname(LEADS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LEADS_PATH))
    fs.writeFileSync(LEADS_PATH, JSON.stringify({ leads: {} }, null, 2));
}

function load() {
  ensureFile();
  try {
    const raw = fs.readFileSync(LEADS_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!data.leads) data.leads = {};
    return data;
  } catch {
    return { leads: {} };
  }
}

function save(data) {
  ensureFile();
  const tmp = LEADS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, LEADS_PATH); // atómico
}

export function getLead(chatId) {
  return load().leads[chatId] || null;
}

export function listLeads(stage) {
  const all = Object.values(load().leads);
  const rows = stage ? all.filter((l) => l.stage === stage) : all;
  return rows.sort(
    (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
  );
}

// Upsert parcial. `note` (si viene) se agrega al historial de notas con timestamp.
export function upsertLead(chatId, patch = {}, note) {
  if (!chatId) throw new Error("chatId requerido");
  const data = load();
  const now = new Date().toISOString();
  const prev = data.leads[chatId] || {
    chatId,
    stage: "NUEVO",
    notes: [],
    createdAt: now,
  };

  if (patch.stage && !STAGES.includes(patch.stage))
    throw new Error(`stage inválido: ${patch.stage}. Válidos: ${STAGES.join(", ")}`);

  const next = {
    ...prev,
    ...pick(patch, [
      "phone",
      "name",
      "business",
      "businessType",
      "stage",
      "tenantId",
    ]),
    notes: Array.isArray(prev.notes) ? prev.notes.slice() : [],
    updatedAt: now,
  };
  if (note && String(note).trim())
    next.notes.push({ at: now, text: String(note).trim() });

  data.leads[chatId] = next;
  save(data);
  return next;
}

// Marca de mensajería (la usa el MCP al leer/responder para tener contexto).
export function touchLead(chatId, kind /* "in" | "out" */, patch = {}) {
  const data = load();
  const now = new Date().toISOString();
  const prev = data.leads[chatId] || {
    chatId,
    stage: "NUEVO",
    notes: [],
    createdAt: now,
  };
  const next = {
    ...prev,
    ...pick(patch, ["phone", "name"]),
    notes: Array.isArray(prev.notes) ? prev.notes : [],
    updatedAt: now,
  };
  if (kind === "out") next.lastOutboundAt = now;
  if (kind === "in") next.lastInboundAt = now;
  data.leads[chatId] = next;
  save(data);
  return next;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}
