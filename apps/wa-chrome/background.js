// Service worker: hace las llamadas al backend del TPV. Corre con
// host_permissions sobre api.mrtpvrest.com, así que NO hay restricción de CORS
// (el content script no puede hacer cross-origin; por eso se delega aquí).
//
// El SLUG del restaurante ya NO está hardcodeado: cada negocio lo configura
// desde el popup de la extensión (icono) y se guarda en chrome.storage.sync.
// Así la misma extensión sirve para cualquier restaurante del SaaS.
//
// Mensajes que atiende:
//   { type:"getConfig" }              -> devuelve { slug, name } guardados (o vacío)
//   { type:"verify",  slug }          -> GET  /api/store/info (valida y trae el nombre)
//   { type:"saveConfig", slug, name } -> guarda en storage.sync
//   { type:"parse",  text }           -> POST /api/store/parse-order
//   { type:"create", order }          -> POST /api/store/orders (source WHATSAPP)

const API_BASE = "https://api.mrtpvrest.com";
const STORE_KEY = "mbwa_config"; // { slug, name }

function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORE_KEY, (o) => resolve(o?.[STORE_KEY] || { slug: "", name: "" }));
  });
}
function saveConfig(cfg) {
  return new Promise((resolve) => chrome.storage.sync.set({ [STORE_KEY]: cfg }, () => resolve(true)));
}

async function reqJSON(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const slugParam = (slug) => `?r=${encodeURIComponent(slug)}`;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "getConfig") {
        sendResponse({ ok: true, config: await getConfig() });
        return;
      }

      if (msg?.type === "verify") {
        const slug = String(msg.slug || "").trim();
        if (!slug) return sendResponse({ ok: false, error: "Falta el código de la tienda." });
        const r = await reqJSON("GET", `/api/store/info${slugParam(slug)}`);
        if (!r.ok || !r.data?.name) {
          const error = r.status === 404
            ? "No existe una tienda con ese código."
            : (r.data?.error || "No se pudo verificar.");
          return sendResponse({ ok: false, error });
        }
        sendResponse({ ok: true, data: { slug: r.data.slug || slug, name: r.data.name, logo: r.data.logo || null } });
        return;
      }

      if (msg?.type === "saveConfig") {
        await saveConfig({ slug: String(msg.slug || "").trim(), name: String(msg.name || "").trim() });
        sendResponse({ ok: true });
        return;
      }

      // A partir de aquí se requiere un restaurante configurado.
      const { slug } = await getConfig();
      if (!slug) {
        sendResponse({ ok: false, notConfigured: true, error: "Configura tu restaurante: clic en el icono de la extensión." });
        return;
      }

      if (msg?.type === "parse") {
        sendResponse(await reqJSON("POST", `/api/store/parse-order${slugParam(slug)}`, { text: msg.text }));
      } else if (msg?.type === "create") {
        sendResponse(await reqJSON("POST", `/api/store/orders${slugParam(slug)}`, { ...msg.order, source: "WHATSAPP" }));
      } else {
        sendResponse({ ok: false, error: "tipo desconocido" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // respuesta asíncrona
});
