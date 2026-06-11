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
        // El texto real es la última línea no vacía (descarta encabezados de
        // cita/reenvío que WhatsApp incluye en el mismo copyable).
        const lines = (c.innerText || "").split("\n").map((l) => l.trim()).filter(Boolean);
        return { incoming, text: lines[lines.length - 1] || "" };
      })
      .filter((m) => m.text);

    // Último "turno" del cliente: la racha de mensajes entrantes más reciente.
    let trailing = [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].incoming) trailing.unshift(msgs[i]);
      else if (trailing.length) break;
    }
    if (trailing.length === 0) trailing = msgs.filter((m) => m.incoming).slice(-4);

    return { customerName, phone: "", text: trailing.map((m) => m.text).join("\n"), count: trailing.length };
  }

  const bg = (type, payload) =>
    new Promise((res) => chrome.runtime.sendMessage({ type, ...payload }, res));

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
    #mbwa .card button{padding:6px;font-size:11px}`;
  document.documentElement.appendChild(style);

  const panel = document.createElement("div");
  panel.id = "mbwa";
  panel.innerHTML = `
    <div class="hd"><span class="dot"></span><b>Pedido → TPV</b>
      <label id="mbwa-watchlbl" title="Vigilar nuevos pedidos">
        <input type="checkbox" id="mbwa-watch" checked> vigilar</label>
      <span class="x" id="mbwa-x">×</span></div>
    <div class="bd">
      <div id="mbwa-new"></div>
      <button class="b1" id="mbwa-read">📦 Leer pedido del chat abierto</button>
      <div id="mbwa-out"></div>
    </div>`;
  document.body.appendChild(panel);

  const out = panel.querySelector("#mbwa-out");
  let state = { chat: null, parsed: null, orderType: "TAKEOUT", address: "" };

  panel.querySelector("#mbwa-x").onclick = () => panel.remove();

  panel.querySelector("#mbwa-read").onclick = async () => {
    const chat = readOpenChat();
    if (!chat || !chat.text) { out.innerHTML = `<div class="st" style="color:${AMBER}">Abre un chat con un pedido primero.</div>`; return; }
    state.chat = chat; state.parsed = null;
    out.innerHTML = `<div class="muted">Cliente: ${esc(chat.customerName)} · ${chat.count} mensaje(s)</div><div class="st">Interpretando…</div>`;
    const r = await bg("parse", { text: chat.text });
    if (!r || !r.ok) { out.innerHTML += `<div class="st" style="color:#f88">Error al interpretar.</div>`; return; }
    state.parsed = r.data;
    renderParsed();
  };

  function renderParsed() {
    const items = state.parsed?.items || [];
    if (items.length === 0) {
      out.innerHTML = `<div class="muted">Cliente: ${esc(state.chat.customerName)}</div>
        <div class="st" style="color:${AMBER}">No se reconoció ningún producto. Revisa el chat o ajústalo manualmente en el TPV.</div>`;
      return;
    }
    const list = items.map((i) => `<div class="it"><span>${i.quantity || 1}× ${esc(i.product?.name || i.name || i.menuItemId)}</span></div>`).join("");
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
      items: (state.parsed.items || []).map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity || 1 })),
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
  // resaltamos el chat en la lista para que el operador le dé clic.
  function openChat(r) {
    r.scrollIntoView({ block: "center" });
    const prev = r.style.boxShadow;
    r.style.boxShadow = "inset 0 0 0 2px " + AMBER;
    r.style.borderRadius = "10px";
    setTimeout(() => { r.style.boxShadow = prev; }, 3000);
  }

  function scanNew() {
    const box = panel.querySelector("#mbwa-new");
    if (!box) return;
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
    box.querySelectorAll("button[data-i]").forEach((b) => { b.onclick = () => openChat(cands[+b.dataset.i].r); });
  }

  panel.querySelector("#mbwa-watch").onchange = scanNew;
  setInterval(scanNew, 7000);
  setTimeout(scanNew, 1500);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
})();
