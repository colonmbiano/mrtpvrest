// Configuración compartida entre el worker de WhatsApp y el servidor MCP.
// Todo es sobre-escribible por variables de entorno para que puedas mover
// rutas/puerto sin tocar código.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cargar el .env de ESTA carpeta por ruta absoluta. Claude lanza el MCP con el
// cwd en la raíz del repo, así que `dotenv/config` (que resuelve contra cwd)
// leería el .env equivocado o ninguno.
dotenv.config({ path: path.join(__dirname, ".env") });

export const WORKER_PORT = Number(process.env.SALES_WA_PORT || 8790);

// El MCP habla con el worker por HTTP local. 127.0.0.1 a propósito:
// el worker NO debe quedar expuesto a la red (controla un WhatsApp real).
export const WORKER_URL =
  process.env.SALES_WA_WORKER_URL || `http://127.0.0.1:${WORKER_PORT}`;

// Sesión de whatsapp-web.js (LocalAuth). NUNCA se commitea (ver .gitignore):
// contiene las credenciales del WhatsApp = takeover si se filtra.
export const WA_DATA_PATH =
  process.env.SALES_WA_DATA_PATH || path.join(__dirname, ".wwebjs_auth");

// Pipeline de leads (CRM ligero en JSON). Tampoco se commitea.
export const LEADS_PATH =
  process.env.SALES_LEADS_PATH || path.join(__dirname, "data", "leads.json");

// Chromium del sistema opcional (si no quieres el que trae puppeteer).
export const PUPPETEER_EXECUTABLE_PATH =
  process.env.SALES_WA_CHROMIUM_PATH || undefined;

// Números a ignorar (por si el número de ventas recibe notificaciones
// automáticas de Amazon/paquetería, etc.). Match por últimos 10 dígitos.
export const IGNORE_NUMBERS = (process.env.SALES_WA_IGNORE_NUMBERS || "")
  .split(",")
  .map((s) => s.replace(/\D/g, "").slice(-10))
  .filter(Boolean);

// No reenviar el MISMO texto al MISMO chat dentro de esta ventana (anti-spam
// / anti-baneo). Milisegundos.
export const DUP_SEND_WINDOW_MS = Number(
  process.env.SALES_WA_DUP_WINDOW_MS || 60_000
);

// --- Backend MRTPV (tools v2: alta de tenant / menú / promo) ---------------
// Base del API del backend y token de plataforma para /api/sales-bot/*.
// Si no se configuran, los tools saas_* devuelven un error claro (no rompen la
// mensajería, que no depende del backend).
export const MRTPV_API_BASE =
  process.env.MRTPV_API_BASE || "https://api.mrtpvrest.com";
export const MRTPV_SALES_BOT_TOKEN = process.env.MRTPV_SALES_BOT_TOKEN || "";
