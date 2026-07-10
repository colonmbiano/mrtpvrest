// saas-sales-worker
// Proceso PERSISTENTE que mantiene viva la sesión de WhatsApp (whatsapp-web.js)
// del número de VENTAS del SaaS y la expone por HTTP local para que el MCP la
// consuma. Se separa del MCP a propósito: así la sesión NO se reconecta cada vez
// que arrancas Claude (reconectar seguido dispara el anti-abuso de Meta).
//
// Arranque:  node worker.js      (déjalo corriendo siempre; escanea el QR 1 vez)
// Endpoints (solo 127.0.0.1):
//   GET  /status            -> estado de conexión
//   GET  /qr                -> QR pendiente (string) para vincular
//   GET  /queue?limit=20    -> conversaciones con mensajes sin responder
//   GET  /chat/:id?limit=30 -> historial de un chat
//   POST /send {chatId,text}-> responde (con guardas anti-spam)
import fs from "node:fs";
import express from "express";
import qrcode from "qrcode-terminal";
import wweb from "whatsapp-web.js";
import {
  WORKER_PORT,
  WA_DATA_PATH,
  PUPPETEER_EXECUTABLE_PATH,
  IGNORE_NUMBERS,
  DUP_SEND_WINDOW_MS,
} from "./config.js";

const { Client, LocalAuth } = wweb;

// --- Estado en memoria ------------------------------------------------------
let ready = false;
let latestQr = null;
let meInfo = null;
const lastSent = new Map(); // chatId -> { text, ts }  (anti-duplicado)

// --- Utilidades -------------------------------------------------------------
const isBlockedChat = (id = "") =>
  !id ||
  id.endsWith("@g.us") || // grupos
  id === "status@broadcast" ||
  id.endsWith("@broadcast") ||
  id.endsWith("@newsletter");

const phoneFromId = (id = "") => {
  // c.us => número real; lid (linked-id de privacidad) => no es teléfono.
  const m = /^(\d+)@c\.us$/.exec(id);
  return m ? m[1] : null;
};

const isIgnored = (id = "") => {
  const phone = phoneFromId(id);
  if (!phone) return false;
  const last10 = phone.slice(-10);
  return IGNORE_NUMBERS.includes(last10);
};

const trunc = (s = "", n = 140) =>
  typeof s === "string" && s.length > n ? s.slice(0, n) + "…" : s || "";

// --- Limpieza de locks de Chromium (por si un arranque previo murió sucio) ---
function cleanChromiumLocks(dir) {
  try {
    for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
      const p = `${dir}/${name}`;
      if (fs.existsSync(p)) fs.rmSync(p, { force: true, recursive: true });
    }
  } catch {
    /* best-effort */
  }
}

// --- Cliente de WhatsApp ----------------------------------------------------
cleanChromiumLocks(WA_DATA_PATH);

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: WA_DATA_PATH }),
  puppeteer: {
    headless: true,
    executablePath: PUPPETEER_EXECUTABLE_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--no-zygote",
    ],
  },
});

client.on("qr", (qr) => {
  latestQr = qr;
  ready = false;
  console.log("\n[saas-sales-worker] Escanea este QR con el número de VENTAS:\n");
  qrcode.generate(qr, { small: true });
  console.log(
    "\n(o abre GET /qr para obtener el string y renderizarlo tú mismo)\n"
  );
});

client.on("ready", () => {
  ready = true;
  latestQr = null;
  meInfo = client.info
    ? { wid: client.info.wid?._serialized, pushname: client.info.pushname }
    : null;
  console.log("[saas-sales-worker] ✅ Conectado y listo.", meInfo || "");
});

client.on("authenticated", () => console.log("[saas-sales-worker] Autenticado."));
client.on("auth_failure", (m) =>
  console.error("[saas-sales-worker] auth_failure:", m)
);
client.on("disconnected", (reason) => {
  ready = false;
  console.error("[saas-sales-worker] Desconectado:", reason);
});

// MODO SOLO-RESPONDER: el worker NO auto-contesta nada. Claude decide vía /send.
// Aquí solo registramos entrantes para diagnóstico.
client.on("message", (msg) => {
  if (isBlockedChat(msg.from) || isIgnored(msg.from)) return;
  console.log(`[saas-sales-worker] ← ${msg.from}: ${trunc(msg.body, 60)}`);
});

client.initialize().catch((e) => {
  console.error("[saas-sales-worker] Error al inicializar:", e);
  process.exit(1);
});

// --- HTTP API (solo local) --------------------------------------------------
const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/status", (_req, res) => {
  res.json({ ready, hasQr: !!latestQr, me: meInfo });
});

app.get("/qr", (_req, res) => {
  res.json({ ready, qr: latestQr });
});

app.get("/queue", async (req, res) => {
  if (!ready) return res.status(503).json({ error: "WhatsApp no está listo aún." });
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  try {
    const chats = await client.getChats();
    const rows = [];
    for (const chat of chats) {
      const id = chat.id?._serialized || "";
      if (isBlockedChat(id) || isIgnored(id)) continue;
      const last = chat.lastMessage;
      const needsReply = chat.unreadCount > 0 || (last && !last.fromMe);
      if (!needsReply) continue;
      rows.push({
        chatId: id,
        name: chat.name || phoneFromId(id) || id,
        phone: phoneFromId(id),
        unread: chat.unreadCount || 0,
        lastFromMe: last ? !!last.fromMe : null,
        lastPreview: trunc(last?.body, 140),
        lastTs: last?.timestamp ? last.timestamp * 1000 : null,
      });
    }
    rows.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
    res.json({ conversations: rows.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/chat/:id", async (req, res) => {
  if (!ready) return res.status(503).json({ error: "WhatsApp no está listo aún." });
  const id = req.params.id;
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  try {
    const chat = await client.getChatById(id);
    const msgs = await chat.fetchMessages({ limit });
    res.json({
      chatId: id,
      name: chat.name || phoneFromId(id) || id,
      phone: phoneFromId(id),
      messages: msgs.map((m) => ({
        fromMe: !!m.fromMe,
        body: m.body || "",
        type: m.type,
        ts: m.timestamp ? m.timestamp * 1000 : null,
        hasMedia: !!m.hasMedia,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/send", async (req, res) => {
  if (!ready) return res.status(503).json({ error: "WhatsApp no está listo aún." });
  const { chatId, text } = req.body || {};
  if (!chatId || !text || typeof text !== "string")
    return res.status(400).json({ error: "Faltan chatId o text." });
  if (isBlockedChat(chatId))
    return res.status(400).json({ error: "chatId bloqueado (grupo/status/broadcast)." });

  // Guarda anti-duplicado: no reenviar el mismo texto al mismo chat muy seguido.
  const prev = lastSent.get(chatId);
  if (prev && prev.text === text && Date.now() - prev.ts < DUP_SEND_WINDOW_MS) {
    return res.json({ ok: true, skipped: true, reason: "duplicado reciente" });
  }
  try {
    const sent = await client.sendMessage(chatId, text);
    lastSent.set(chatId, { text, ts: Date.now() });
    res.json({ ok: true, id: sent?.id?._serialized || null });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.listen(WORKER_PORT, "127.0.0.1", () => {
  console.log(
    `[saas-sales-worker] HTTP en http://127.0.0.1:${WORKER_PORT} (solo local)`
  );
});

// Apagado limpio.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    console.log(`\n[saas-sales-worker] ${sig} — cerrando…`);
    try {
      await client.destroy();
    } catch {
      /* ignore */
    }
    process.exit(0);
  });
}
