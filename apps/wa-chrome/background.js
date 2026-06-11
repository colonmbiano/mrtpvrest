// Service worker: hace las llamadas al backend del TPV. Corre con
// host_permissions sobre api.mrtpvrest.com, así que NO hay restricción de CORS
// (el content script no puede hacer cross-origin; por eso se delega aquí).
//
// Mensajes que atiende (desde content.js):
//   { type:"parse",  text }            -> POST /api/store/parse-order
//   { type:"create", order }           -> POST /api/store/orders (source WHATSAPP)

const API_BASE = "https://api.mrtpvrest.com";
const SLUG = "master-burguer-s";

async function postJSON(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "parse") {
        const r = await postJSON(`/api/store/parse-order?r=${SLUG}`, { text: msg.text });
        sendResponse(r);
      } else if (msg?.type === "create") {
        const r = await postJSON(`/api/store/orders?r=${SLUG}`, { ...msg.order, source: "WHATSAPP" });
        sendResponse(r);
      } else {
        sendResponse({ ok: false, error: "tipo desconocido" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // respuesta asíncrona
});
