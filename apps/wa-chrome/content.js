// Content script (web.whatsapp.com): panel flotante que lee el CHAT ABIERTO,
// detecta el pedido (vía /api/store/parse-order, IA BYOK del restaurante) y lo
// crea en el TPV con un clic (queda PENDING en "Pedidos Web" para el cajero).
//
// Solo-lectura: lee el DOM del chat que TÚ ya abriste. No abre chats, no manda
// mensajes, no automatiza nada a tus espaldas → riesgo de baneo ~nulo.
//
// Selectores confirmados en WhatsApp Web (jun-2026):
//   - Nombre del chat: #main header span[dir="auto"]
//   - Mensajes: .copyable-text[data-pre-plain-text]  (texto = innerText)
//   - Entrante/saliente: ancestro [data-id] empieza con false_ / true_
//     (el data-id es <fromMe>_<jid>_<msgid>; el jid trae el número si es @c.us)

(() => {
  const AMBER = "#FFB84D";
  const BG = "#0C0C0E";

  const norm = (s) =>
    (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  // ── Protocolo de "pedido estructurado" ─────────────────────────────────
  // Si el agente de WhatsApp Business (o una respuesta rápida) resume el pedido
  // con una PALABRA CLAVE, el bot toma SOLO ese bloque (resumen limpio) en vez
  // de adivinar de la cháchara libre. Más preciso y seguimos 100% solo-lectura.
  // El bloque puede venir del negocio (la IA contesta como negocio) o del
  // cliente, por eso la detección no depende de la dirección del mensaje.
  const SENTINEL = /\b(pedido\s*(listo|confirmado|final|completo)|order\s*ready|resumen\s*del?\s*pedido)\b/i;
  const META_TIPO = /\b(tipo|entrega|modalidad)\b\s*[:\-]?\s*(.+)/i;
  const META_DIR = /\b(direcci[oó]n|domicilio|dir|calle|ubicaci[oó]n)\b\s*[:\-]?\s*(.+)/i;
  const META_TEL = /\b(tel(?:[eé]fono)?|cel(?:ular)?|whatsapp|wa|n[uú]mero)\b\s*[:\-]?\s*([\d][\d\s\-().]{7,})/i;
  const DELIVERY_RE = /\b(domicili|entrega|reparto|env[ií]o|delivery|mandar|llevar a)\b/i;
  const TAKEOUT_RE = /\b(para llevar|recoger|paso por|pickup|en sucursal|mostrador)\b/i;

  // Convierte un bloque de texto del agente en {text, orderType, address, phone}.
  // "text" son sólo las líneas de PRODUCTOS (sin las metalíneas tipo/dir/tel) que
  // se mandan a parse-order; el resto pre-llena el formulario del panel.
  function parseOrderBlock(full) {
    const rawLines = String(full || "").split("\n").map((l) => l.trim()).filter(Boolean);
    let orderType = null, address = "", phone = "";
    const productLines = [];
    for (const line of rawLines) {
      if (SENTINEL.test(line) && norm(line).replace(/[^a-z ]/g, "").trim().split(" ").length <= 4) continue; // la línea-título
      const mDir = line.match(META_DIR);
      const mTel = line.match(META_TEL);
      const mTipo = line.match(META_TIPO);
      if (mTel) { phone = mTel[2].replace(/\D/g, ""); continue; }
      if (mDir) { address = mDir[2].trim(); orderType = orderType || "DELIVERY"; continue; }
      if (mTipo) {
        if (DELIVERY_RE.test(mTipo[2])) orderType = "DELIVERY";
        else if (TAKEOUT_RE.test(mTipo[2])) orderType = "TAKEOUT";
        continue;
      }
      // Metalíneas sueltas de cliente/nombre: descartar de los productos.
      if (/^\s*(cliente|nombre|total|subtotal|pago|notas?)\b/i.test(line)) continue;
      // Línea de producto: viñeta, "N x algo", o "N algo".
      const cleaned = line.replace(/^[•\-\*·▪►]\s*/, "").trim();
      if (cleaned) productLines.push(cleaned);
    }
    // Inferir tipo desde el cuerpo si no vino explícito.
    if (!orderType) {
      if (address || DELIVERY_RE.test(full)) orderType = "DELIVERY";
      else if (TAKEOUT_RE.test(full)) orderType = "TAKEOUT";
    }
    return { text: productLines.join(". "), orderType, address, phone, structured: true, count: productLines.length };
  }

  // ── Leer el chat abierto ───────────────────────────────────────────────
  // Entrante/saliente se decide por el NOMBRE del remitente en
  // data-pre-plain-text ("[hora, fecha] Remitente: "): si coincide con el
  // nombre del chat (el cliente) es entrante; si es el negocio, saliente.
  // (El data-id ya no trae el formato fromMe_jid, por eso no se usa.)
  function readOpenChat() {
    const main = document.querySelector("#main");
    if (!main) return null;
    const nameEl = main.querySelector('header span[dir="auto"]');
    const customerName = nameEl ? nameEl.textContent.trim() : "";
    const custFirst = norm(customerName).split(" ")[0];

    const copyables = [...main.querySelectorAll(".copyable-text[data-pre-plain-text]")];
    const msgs = copyables
      .map((c) => {
        const pre = c.getAttribute("data-pre-plain-text") || "";
        const m = pre.match(/\]\s*(.+?):\s*$/);
        const sender = m ? m[1].trim() : "";
        const incoming = !!custFirst && norm(sender).split(" ").includes(custFirst);
        // full = mensaje completo (para bloques estructurados multilínea);
        // last = última línea (descarta encabezados de cita/reenvío).
        const full = (c.innerText || "").trim();
        const lines = full.split("\n").map((l) => l.trim()).filter(Boolean);
        return { incoming, full, text: lines[lines.length - 1] || "" };
      })
      .filter((m) => m.full);

    // 1) ¿Hay un bloque ESTRUCTURADO reciente (palabra clave)? Gana siempre:
    //    es un resumen limpio del agente, no la cháchara del cliente.
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (SENTINEL.test(msgs[i].full)) {
        const blk = parseOrderBlock(msgs[i].full);
        if (blk.text) return { customerName, phone: blk.phone || "", orderType: blk.orderType, address: blk.address, text: blk.text, count: blk.count, structured: true };
      }
    }

    // 2) Si no, el último "turno" del cliente: racha de mensajes entrantes.
    let trailing = [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].incoming) trailing.unshift(msgs[i]);
      else if (trailing.length) break;
    }
    if (trailing.length === 0) trailing = msgs.filter((m) => m.incoming).slice(-4);

    return { customerName, phone: "", text: trailing.map((m) => m.text).join(". "), count: trailing.length, structured: false };
  }

  // Tras recargar la extensión, el content script viejo queda "huérfano":
  // chrome.runtime pierde su id y sendMessage truena. Detectamos ese caso y
  // devolvemos un error claro (en vez de colgarnos en "Interpretando…").
  const ctxAlive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const bg = (type, payload) =>
    new Promise((res) => {
      if (!ctxAlive()) return res({ ok: false, stale: true, error: "Recarga la página (F5)" });
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (r) => {
          if (chrome.runtime?.lastError) return res({ ok: false, stale: true, error: "Recarga la página (F5)" });
          res(r);
        });
      } catch { res({ ok: false, stale: true, error: "Recarga la página (F5)" }); }
    });

  // ── UI ─────────────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    #mbwa{position:fixed;right:18px;bottom:18px;width:320px;z-index:99999;
      font-family:'Segoe UI',system-ui,sans-serif;color:#fff;background:${BG};
      border:1px solid rgba(255,255,255,.12);border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.5);overflow:hidden}
    #mbwa .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;background:rgba(255,184,77,.12);border-bottom:1px solid rgba(255,255,255,.08)}
    #mbwa .hd b{font-size:13px;letter-spacing:.04em}
    #mbwa .hd .dot{width:8px;height:8px;border-radius:50%;background:${AMBER}}
    #mbwa .bd{padding:12px 14px;max-height:46vh;overflow:auto}
    #mbwa button{cursor:pointer;border:none;border-radius:12px;font-weight:700;font-size:12px;padding:10px;width:100%}
    #mbwa .b1{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.14)}
    #mbwa .b2{background:${AMBER};color:${BG};margin-top:8px}
    #mbwa .it{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    #mbwa .muted{color:rgba(255,255,255,.5);font-size:11px}
    #mbwa .row{display:flex;gap:6px;margin:8px 0}
    #mbwa .row button{font-size:11px;padding:7px}
    #mbwa .seg{background:rgba(255,255,255,.06);color:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.1)}
    #mbwa .seg.on{background:${AMBER};color:${BG}}
    #mbwa input{width:100%;box-sizing:border-box;margin-top:6px;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;font-size:12px}
    #mbwa .st{font-size:12px;margin-top:8px;min-height:16px}
    #mbwa #mbwa-watchlbl{margin-left:auto;display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,.6);cursor:pointer}
    #mbwa .x{cursor:pointer;color:rgba(255,255,255,.5);font-size:16px;line-height:1;padding-left:8px}
    #mbwa .card{background:rgba(255,184,77,.1);border:1px solid rgba(255,184,77,.3);border-radius:12px;padding:8px 10px;margin-bottom:8px}
    #mbwa .card .nm{font-size:12px;font-weight:700}
    #mbwa .card .pv{font-size:11px;color:rgba(255,255,255,.6);margin:2px 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #mbwa .card button{padding:6px;font-size:11px}
    #mbwa .shop{font-size:11px;color:rgba(255,255,255,.6);margin:0 0 10px;display:flex;align-items:center;gap:5px}
    #mbwa .shop b{color:#fff;font-weight:700}
    #mbwa .gate{font-size:12px;line-height:1.5;color:rgba(255,255,255,.85);background:rgba(255,184,77,.1);border:1px solid rgba(255,184,77,.3);border-radius:12px;padding:10px 12px;margin-bottom:8px}
    #mbwa .gate b{color:${AMBER}}`;
  document.documentElement.appendChild(style);

  const panel = document.createElement("div");
  panel.id = "mbwa";
  panel.innerHTML = `
    <div class="hd"><span class="dot"></span><b>Pedido → TPV</b>
      <label id="mbwa-watchlbl" title="Vigilar nuevos pedidos">
        <input type="checkbox" id="mbwa-watch" checked> vigilar</label>
      <span class="x" id="mbwa-x">×</span></div>
    <div class="bd">
      <div id="mbwa-shop" class="shop"></div>
      <div id="mbwa-gate"></div>
      <div id="mbwa-new"></div>
      <button class="b1" id="mbwa-read">📦 Leer pedido del chat abierto</button>
      <div id="mbwa-out"></div>
    </div>`;
  document.body.appendChild(panel);

  const out = panel.querySelector("#mbwa-out");
  let state = { chat: null, parsed: null, orderType: "TAKEOUT", address: "" };
  // Chat marcado por el vigilante que esperamos que el cajero abra: al detectar
  // que ese chat quedó abierto, lo leemos solo (cierra el hueco manual).
  let pendingAutoRead = null;   // nombre normalizado del chat a auto-leer
  let lastReadName = null;      // evita re-leer el mismo chat en loop

  panel.querySelector("#mbwa-x").onclick = () => panel.remove();

  // ── Configuración del restaurante (slug) ───────────────────────────────
  // El slug se configura desde el popup (icono) y vive en chrome.storage.sync.
  // Sin restaurante configurado el panel no lee ni crea: solo guía a configurar.
  let configured = false;
  const shopEl = panel.querySelector("#mbwa-shop");
  const gateEl = panel.querySelector("#mbwa-gate");
  const readBtn = panel.querySelector("#mbwa-read");

  function renderConfig(cfg) {
    configured = !!(cfg && cfg.slug);
    if (configured) {
      shopEl.innerHTML = `🏪 <b>${esc(cfg.name || cfg.slug)}</b>`;
      gateEl.innerHTML = "";
      readBtn.style.display = "";
    } else {
      shopEl.innerHTML = "";
      gateEl.innerHTML = `Conecta tu restaurante: clic en el <b>icono de la extensión</b> (arriba a la derecha del navegador) y escribe el código de tu tienda.`;
      readBtn.style.display = "none";
    }
  }

  function loadConfig() { bg("getConfig").then((r) => renderConfig(r && r.ok ? r.config : null)); }
  loadConfig();
  // El popup guarda en storage.sync → reaccionamos en vivo (sin recargar).
  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === "sync" && changes.mbwa_config) renderConfig(changes.mbwa_config.newValue);
    });
  } catch {}

  async function doRead() {
    if (!configured) { out.innerHTML = `<div class="st" style="color:${AMBER}">Configura tu restaurante primero (icono de la extensión).</div>`; return; }
    const chat = readOpenChat();
    if (!chat || !chat.text) { out.innerHTML = `<div class="st" style="color:${AMBER}">Abre un chat con un pedido primero.</div>`; return; }
    state.chat = chat; state.parsed = null;
    lastReadName = norm(chat.customerName);
    // Pre-llenado desde un bloque estructurado del agente (tipo/dir/tel).
    if (chat.structured) {
      if (chat.orderType) state.orderType = chat.orderType;
      if (chat.address) state.address = chat.address;
    }
    const badge = chat.structured ? `<div class="muted" style="color:${AMBER}">📋 Pedido estructurado del agente</div>` : "";
    out.innerHTML = `${badge}<div class="muted">Cliente: ${esc(chat.customerName)} · ${chat.count} ${chat.structured ? "producto(s)" : "mensaje(s)"}</div><div class="st">Interpretando…</div>`;
    const r = await bg("parse", { text: chat.text });
    if (!r || !r.ok) {
      if (r?.notConfigured) { renderConfig(null); out.innerHTML = `<div class="st" style="color:${AMBER}">Configura tu restaurante primero (icono de la extensión).</div>`; return; }
      const msg = r?.stale ? "⚠ Extensión recargada — refresca WhatsApp (F5)." : "Error al interpretar.";
      out.innerHTML = `<div class="muted">Cliente: ${esc(chat.customerName)}</div><div class="st" style="color:#f88">${msg}</div>`;
      return;
    }
    state.parsed = r.data;
    renderParsed();
  }

  panel.querySelector("#mbwa-read").onclick = doRead;

  // Auto-lectura: si el cajero abrió el chat que el vigilante marcó, parsea solo.
  function autoReadTick() {
    if (!pendingAutoRead) return;
    const nameEl = document.querySelector('#main header span[dir="auto"]');
    const open = nameEl ? norm(nameEl.textContent) : "";
    if (!open) return;
    if (open === pendingAutoRead && open !== lastReadName) {
      pendingAutoRead = null;
      doRead();
    }
  }
  setInterval(autoReadTick, 1000);

  function renderParsed() {
    const items = state.parsed?.items || [];
    if (items.length === 0) {
      out.innerHTML = `<div class="muted">Cliente: ${esc(state.chat.customerName)}</div>
        <div class="st" style="color:${AMBER}">No se reconoció ningún producto. Revisa el chat o ajústalo manualmente en el TPV.</div>`;
      return;
    }
    const list = items.map((i) => {
      // La IA deduce variante y opciones del texto → las mostramos bajo el
      // producto para que el cajero vea qué se eligió. ⚠ si aún falta algo
      // obligatorio (needsReview): toca completarlo al confirmar en el TPV.
      const extras = [];
      if (i.variantName) extras.push(esc(i.variantName));
      if (Array.isArray(i.modifierNames)) extras.push(...i.modifierNames.map(esc));
      const sub = extras.length ? `<div class="muted">${extras.join(" · ")}</div>` : "";
      const warn = i.needsReview ? ` <span style="color:${AMBER}" title="Falta variante/opción; complétalo en el TPV">⚠</span>` : "";
      return `<div class="it" style="display:block"><span>${i.quantity || 1}× ${esc(i.product?.name || i.name || i.menuItemId)}${warn}</span>${sub}</div>`;
    }).join("");
    out.innerHTML = `
      <div class="muted">Cliente: ${esc(state.chat.customerName)}${state.chat.phone ? " · +" + state.chat.phone : ""}</div>
      <div style="margin:8px 0">${list}</div>
      ${state.parsed.unmatched?.length ? `<div class="muted">No reconocido: ${esc(state.parsed.unmatched.join(", "))}</div>` : ""}
      <div class="row">
        <button class="seg ${state.orderType === "TAKEOUT" ? "on" : ""}" data-t="TAKEOUT">Para llevar</button>
        <button class="seg ${state.orderType === "DELIVERY" ? "on" : ""}" data-t="DELIVERY">Domicilio</button>
      </div>
      <div id="mbwa-addr"></div>
      <button class="b2" id="mbwa-create">✅ Crear en TPV</button>
      <div class="st" id="mbwa-st"></div>`;
    out.querySelectorAll(".seg").forEach((b) => (b.onclick = () => { state.orderType = b.dataset.t; renderParsed(); }));
    if (state.orderType === "DELIVERY") {
      out.querySelector("#mbwa-addr").innerHTML = `<input id="mbwa-addrI" placeholder="Dirección de entrega…" value="${esc(state.address)}">`;
      out.querySelector("#mbwa-addrI").oninput = (e) => (state.address = e.target.value);
    }
    out.querySelector("#mbwa-create").onclick = createOrder;
  }

  async function createOrder() {
    const st = out.querySelector("#mbwa-st");
    if (state.orderType === "DELIVERY" && !state.address.trim()) { st.style.color = AMBER; st.textContent = "Falta la dirección."; return; }
    st.style.color = "#fff"; st.textContent = "Creando…";
    const order = {
      items: (state.parsed.items || []).map((i) => ({
        menuItemId: i.menuItemId,
        quantity: i.quantity || 1,
        // Variante y opciones deducidas por la IA (el backend valida y cobra).
        ...(i.variantId ? { variantId: i.variantId } : {}),
        ...(Array.isArray(i.modifierIds) && i.modifierIds.length ? { modifierIds: i.modifierIds } : {}),
      })),
      customerName: state.chat.customerName || "Cliente WhatsApp",
      customerPhone: state.chat.phone || null,
      orderType: state.orderType,
      deliveryAddress: state.orderType === "DELIVERY" ? state.address.trim() : null,
      notes: "Pedido recibido por WhatsApp (pendiente de confirmar).",
    };
    const r = await bg("create", { order });
    if (r && r.ok) {
      st.style.color = "#88D66C";
      st.innerHTML = `✅ Creado #${esc(String(r.data?.orderNumber || r.data?.id || ""))} · total $${Number(r.data?.total || 0).toFixed(2)}<br><span class="muted">Acéptalo en "Pedidos Web" del TPV.</span>`;
    } else {
      st.style.color = "#f88";
      st.textContent = "No se pudo crear: " + (r?.data?.error || r?.error || "error");
    }
  }

  // ── Vigilante de nuevos pedidos ────────────────────────────────────────
  // Revisa los chats NO LEÍDOS y marca los que parecen pedido (cantidades o
  // productos; descarta "gracias/ok/foto/…"). Solo IDENTIFICA y avisa: al abrir,
  // el cajero usa "Leer pedido del chat abierto" para el parseo exacto (texto
  // completo) y crea. Así no depende del preview truncado de la lista.
  // ¿El preview parece pedido? Requiere un producto, una cantidad pegada a una
  // palabra ("2 alitas") o una frase de pedido. Un número/palabra suelto NO basta.
  const PRODUCT = /alit|bonel|hamburg|burger|taco|burrit|gringa|papa|refresc|coca|agua|promo|kilo|combo|pizza|nugget|costill|antoj|quesadill|alambr|chela|cerveza|orden de|hot ?dog/i;
  const INTENT = /quiero|me da|me das|mandam|para llevar|a domicili|me preparas|me haces|me armas|un pedido|el pedido/i;
  const QTY = /\d+\s*[a-záéíóúñ]{3,}/i; // "2 alitas", "1 burrito"
  const NOISE = /^(gracias|ok|okay|oka|ya|listo|s[ií]|va|vale|sip|hola|buenas|buenos|foto|sticker|audio|imagen|video|ubicaci|jaja|bn|buenas noches|👍|🙏|❤)/i;
  function looksOrder(p) {
    p = (p || "").trim();
    if (SENTINEL.test(p)) return true; // bloque estructurado del agente → seguro
    if (p.length < 5) return false;
    if (NOISE.test(p)) return false;
    return PRODUCT.test(p) || QTY.test(p) || INTENT.test(p);
  }

  function unreadRows() {
    const pane = document.querySelector("#pane-side");
    if (!pane) return [];
    return [...pane.querySelectorAll('[role="row"]')].filter((r) => {
      const t = r.innerText || "";
      return /no le[ií]d/i.test(t) || !!r.querySelector('[aria-label*="no le"]');
    });
  }

  function rowInfo(r) {
    const nameEl = r.querySelector("span[title]");
    const name = nameEl ? nameEl.getAttribute("title") : "";
    const lines = (r.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean)
      .filter((l) => !/no le[ií]d/i.test(l) && !/^\d{1,2}:\d{2}/.test(l)
        && !/^(ayer|lunes|martes|mi.rcoles|jueves|viernes|s.bado|domingo)$/i.test(l));
    return { name, preview: lines[lines.length - 1] || "" };
  }

  // WhatsApp no abre chats con clicks programáticos (exige gesto real), así que
  // resaltamos el chat en la lista para que el operador le dé clic. Además
  // dejamos "armado" ese nombre: en cuanto el cajero lo abra, autoReadTick lo
  // parsea solo (no hace falta volver a apretar "Leer pedido").
  function openChat(r, name) {
    r.scrollIntoView({ block: "center" });
    const prev = r.style.boxShadow;
    r.style.boxShadow = "inset 0 0 0 2px " + AMBER;
    r.style.borderRadius = "10px";
    setTimeout(() => { r.style.boxShadow = prev; }, 3000);
    if (name) { pendingAutoRead = norm(name); lastReadName = null; }
  }

  function scanNew() {
    const box = panel.querySelector("#mbwa-new");
    if (!box) return;
    if (!configured) { box.innerHTML = ""; return; }
    if (!panel.querySelector("#mbwa-watch")?.checked) { box.innerHTML = ""; return; }
    const cands = [];
    for (const r of unreadRows()) {
      const { name, preview } = rowInfo(r);
      if (!name || !looksOrder(preview)) continue;
      cands.push({ name, preview, r });
    }
    if (cands.length === 0) { box.innerHTML = ""; return; }
    box.innerHTML = cands.map((c, i) =>
      `<div class="card"><div class="nm">🆕 ${esc(c.name)}</div><div class="pv">${esc(c.preview)}</div>
       <button class="b2" data-i="${i}" style="margin-top:0">📍 Localizar chat</button></div>`).join("");
    box.querySelectorAll("button[data-i]").forEach((b) => { b.onclick = () => { const c = cands[+b.dataset.i]; openChat(c.r, c.name); }; });
  }

  panel.querySelector("#mbwa-watch").onchange = scanNew;
  setInterval(scanNew, 7000);
  setTimeout(scanNew, 1500);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
})();
